"""
Receipt verification (system_design.md §7.2).

Steps 1–7 are deterministic; steps 8–9 (receipt vision, policy) can only make
the verdict stricter. Every check runs for every viewer; the viewer's role
only decides what is shown.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.formatting import date_only, date_time, hours_since, money, new_id, now
from app.models import Confirmation, Scan, Transfer
from app.security import Viewer
from app.services import ledger, signing
from app.services.cases import open_case
from app.services.parties import Parties, mask_account

OLD_RECEIPT_HOURS = 24
TAMPER_THRESHOLD = 0.8


@dataclass
class Outcome:
    verdict: str = "VERIFIED"
    reasons: list[str] = field(default_factory=list)
    warnings: list[schemas.ScanWarning] = field(default_factory=list)
    checks: schemas.ScanChecks = field(default_factory=schemas.ScanChecks)
    transfer: Transfer | None = None
    view: str = "public"
    printed_amount_minor: int | None = None

    def fail(self, reason: str) -> "Outcome":
        self.verdict = "SUSPICIOUS"
        self.reasons = [reason]
        return self

    def warn(self, code: str, message: str) -> None:
        self.warnings.append(schemas.ScanWarning(code=code, message=message))


def _evaluate(db: Session, viewer: Viewer | None, req: schemas.ScanIn, parties: Parties) -> Outcome:
    o = Outcome()

    # 1. Obtain the token.
    parsed = signing.parse_token(req.token) if req.token else None
    if parsed is None:
        return o.fail("no_qr")

    # 2–3. Key lookup and signature.
    sig = signing.verify_signature(db, parsed)
    o.checks.signature = "pass" if sig == "pass" else "fail"
    if sig != "pass":
        return o.fail("bad_signature")

    # 4. Load the transfer and compare it with the signed payload.
    t = db.get(Transfer, parsed.payload["tx"])
    if t is None:
        return o.fail("unknown_transfer")
    o.transfer = t
    p = parsed.payload
    if p.get("amt") != t.amount_minor or p.get("ccy") != t.currency or p.get("to") != signing.payee_hash(signing.payee_ref(t)):
        return o.fail("payload_mismatch")

    # 5. Viewer role. An inter-bank payee isn't on this platform, so nobody here can see it as the payee.
    account_id = viewer.account.id if viewer and viewer.account else None
    outbound_interbank = t.rail == "interbank" and t.payee_account_id == ledger.NETWORK
    if outbound_interbank and account_id != t.payer_account_id:
        o.checks.payee = "external"
    elif account_id and account_id == t.payee_account_id:
        o.view, o.checks.payee = "payee", "match"
    elif account_id and account_id == t.payer_account_id:
        o.view, o.checks.payee = "payer", "payer"
    elif viewer is not None:
        o.checks.payee = "other"
        o.warn("not_your_payment", f"This payment was made to {parties.name(t.payee_account_id)}, not to you.")
    else:
        o.checks.payee = "public"

    # 6. Live status from the ledger.
    o.checks.status = t.status
    if t.status in ("failed", "reversed"):
        return o.fail("reversed")
    if t.status in ("pending", "held", "initiated"):
        o.verdict = "PENDING"

    # 7. Replay.
    o.checks.replay = "none"
    if db.get(Confirmation, t.tx) is not None:
        o.checks.replay = "confirmed"
        return o.fail("already_confirmed")
    if o.view == "payee":
        # Only an earlier check that showed the payment as genuine means it could be reused now.
        earlier = db.scalar(
            select(Scan)
            .where(Scan.tx == t.tx, Scan.viewer_user_id == viewer.user.id, Scan.verdict != "SUSPICIOUS")  # type: ignore[union-attr]
            .order_by(Scan.created_at)
            .limit(1)
        )
        if earlier:
            o.checks.replay = "checked_before"
            o.warn("previously_checked", f"You already checked this payment on {date_time(earlier.created_at)}. It is not a new payment.")
    if hours_since(t.created_at) > OLD_RECEIPT_HOURS:
        o.warn("old_receipt", f"This payment was made on {date_only(t.created_at)}. Make sure it's for what you're being paid for now.")

    # 8. Receipt vision, whenever an image was uploaded.
    if req.source == "upload":
        vision = req.mock_vision if get_settings().sandbox_mode else None
        if vision is None:
            # The vision service isn't deployed yet (M5): degrade safely (§3.3).
            o.checks.vision = schemas.VisionCheck(result="unavailable")
            o.warn("visual_check_unavailable", "We checked the payment, but couldn't check the image itself.")
        else:
            o.checks.vision = schemas.VisionCheck(
                result="match", printed_amount_minor=vision.printed_amount_minor, tamper_score=vision.tamper_score
            )
            if vision.printed_amount_minor is not None and vision.printed_amount_minor != t.amount_minor:
                o.checks.vision.result = "mismatch"
                o.printed_amount_minor = vision.printed_amount_minor
                return o.fail("text_mismatch")
            if (vision.tamper_score or 0) >= TAMPER_THRESHOLD:
                o.checks.vision.result = "edited"
                return o.fail("edited_image")

    # 9. Policy engine: settled payments from high-risk transfers stay flagged until an analyst clears them.
    if t.risk_band == "high" and t.status == "settled":
        return o.fail("risk_flag")

    # 10.
    return o


def _interbank_message(o: Outcome) -> str | None:
    """Wording for payments to another bank: we can vouch for what the network confirmed, not their ledger."""
    t = o.transfer
    if not t or t.rail != "interbank" or t.payee_account_id != ledger.NETWORK or o.reasons[:1] not in ([], ["reversed"]):
        return None
    amount = money(t.amount_minor, t.currency)
    where = f"{t.counterparty_bank_name} account {mask_account(t.counterparty_account_number)}"
    if t.status == "reversed":
        return f"This payment of {amount} to {where} was reversed by the recipient's bank. The money went back to the sender."
    if t.status == "failed":
        return f"This payment of {amount} to {where} failed. The money went back to the sender."
    if o.verdict == "PENDING":
        return f"This payment of {amount} to {where} is still being processed by the payment network."
    when = date_time(t.settled_at or t.created_at)
    if o.view == "payer":
        return f"Your payment of {amount} to {t.counterparty_name} ({where}) was confirmed by the payment network on {when}."
    return f"Genuine receipt. {amount} was sent to {where} and confirmed by the payment network on {when}."


def _message(db: Session, o: Outcome, parties: Parties) -> str:
    if (interbank_text := _interbank_message(o)) is not None:
        return interbank_text
    t = o.transfer
    amount = money(t.amount_minor, t.currency) if t else ""
    reason = o.reasons[0] if o.reasons else None
    if reason == "no_qr":
        return "We couldn't find a valid receipt code. Try a clearer image or paste the receipt link."
    if reason == "bad_signature":
        return "This is not a valid receipt. It was not issued by the platform."
    if reason == "unknown_transfer":
        return "No payment matches this receipt."
    if reason == "payload_mismatch":
        return "This receipt's details don't match the real payment."
    assert t is not None
    if reason == "reversed":
        if t.status == "failed":
            return f"This payment of {amount} was cancelled and never arrived."
        if o.view == "payee":
            return f"This payment of {amount} was reversed. The money is no longer in your account."
        return f"This payment of {amount} was reversed."
    if reason == "already_confirmed":
        confirmation = db.get(Confirmation, t.tx)
        assert confirmation is not None
        return f"This payment was already confirmed on {date_time(confirmation.confirmed_at)}. It is not a new payment."
    if reason == "text_mismatch":
        return f"The receipt shows {money(o.printed_amount_minor or 0, t.currency)}, but the real transfer was {amount}."
    if reason == "edited_image":
        return "This receipt image appears to have been edited."
    if reason == "risk_flag":
        return "This payment has been flagged for review. Don't treat it as paid until it's cleared."
    if o.verdict == "PENDING":
        if t.status == "held":
            return f"This payment of {amount} is on hold for a security check. You'll be notified when it's released."
        return f"This payment of {amount} hasn't arrived yet. You'll be notified when it does."
    arrived = date_time(t.settled_at or t.created_at)
    if o.view == "public":
        return f"Genuine receipt for {amount}, settled on {arrived}."
    if o.view == "payer":
        return f"Your payment of {amount} was delivered on {arrived}."
    return f"{amount} from {parties.side_name(t, t.payer_account_id)} arrived on {arrived}. Payment received."


def scan_receipt(db: Session, viewer: Viewer | None, req: schemas.ScanIn) -> schemas.ScanResultOut:
    parties = Parties(db)
    o = _evaluate(db, viewer, req, parties)
    t = o.transfer
    message = _message(db, o, parties)

    scan = Scan(
        id=new_id("scn"),
        viewer_user_id=viewer.user.id if viewer else None,
        tx=t.tx if t else None,
        source=req.source,
        verdict=o.verdict,
        reasons=o.reasons,
        created_at=now(),
    )
    db.add(scan)
    db.flush()

    if viewer is not None and any(r in ("bad_signature", "text_mismatch", "edited_image") for r in o.reasons):
        open_case(
            db,
            kind="suspicious_scan",
            title=f"Suspicious receipt shown to {viewer.user.display_name}",
            transfer_tx=t.tx if t else None,
            scan_id=scan.id,
            risk_score=0.85,
            reasons=[message],
            dedupe_key=f"scan:{t.tx if t else (req.token or '')[:40]}:{viewer.user.id}",
        )

    show_names = o.view != "public"
    confirmation = db.get(Confirmation, t.tx) if t else None
    return schemas.ScanResultOut(
        scan_id=scan.id,
        verdict=o.verdict,
        reasons=o.reasons,
        warnings=o.warnings,
        view=o.view,
        message=message,
        can_confirm=o.view == "payee" and o.verdict == "VERIFIED",
        can_refund=bool(
            o.view == "payee" and t and t.rail == "internal" and t.status == "settled" and t.kind == "payment" and t.refunded_minor < t.amount_minor
        ),
        checks=o.checks,
        transfer=schemas.ScanTransfer(
            tx=t.tx,
            amount_minor=t.amount_minor,
            currency=t.currency,
            status=t.status,
            created_at=t.created_at,
            settled_at=t.settled_at,
            confirmed_at=confirmation.confirmed_at if confirmation else None,
            refunded_minor=t.refunded_minor if show_names else 0,
            payer_name=parties.side_name(t, t.payer_account_id) if show_names else None,
            payee_name=parties.side_name(t, t.payee_account_id) if show_names else None,
            rail=t.rail,
            payee_bank_name=t.counterparty_bank_name if t.rail == "interbank" and t.payee_account_id == ledger.NETWORK else None,
            payee_account_masked=mask_account(t.counterparty_account_number) if t.rail == "interbank" and t.payee_account_id == ledger.NETWORK else None,
        )
        if t
        else None,
    )
