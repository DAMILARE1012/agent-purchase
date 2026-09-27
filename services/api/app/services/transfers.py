"""Payments, refunds and confirmations (system_design.md §5.2, §6)."""

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.errors import ApiError
from app.formatting import money, new_id, now
from app.models import Account, Confirmation, IdempotencyKey, Transfer
from app.security import Viewer
from app.services import interbank, ledger, payees, risk, signing
from app.services.cases import open_case
from app.services.parties import Parties

STEP_UP_DEMO_CODE = "123456"

# ---- Read models ----------------------------------------------------------------


def to_dto(db: Session, t: Transfer, viewer_account_id: str | None, parties: Parties | None = None) -> schemas.TransferOut:
    parties = parties or Parties(db)
    confirmation = db.get(Confirmation, t.tx)
    return schemas.TransferOut(
        tx=t.tx,
        kind=t.kind,
        refund_of=t.refund_of,
        amount_minor=t.amount_minor,
        currency=t.currency,
        refunded_minor=t.refunded_minor,
        status=t.status,
        note=t.note,
        rail=t.rail,
        network_session_id=t.network_session_id,
        network_status=t.network_status,
        payer=parties.side(t, t.payer_account_id),
        payee=parties.side(t, t.payee_account_id),
        direction="in" if t.payee_account_id == viewer_account_id else "out",
        created_at=t.created_at,
        settled_at=t.settled_at,
        reversed_at=t.reversed_at,
        confirmed_at=confirmation.confirmed_at if confirmation else None,
    )


def risk_dto(t: Transfer) -> schemas.RiskSummary:
    return schemas.RiskSummary(score=t.risk_score, band=t.risk_band, reasons=t.risk_reasons)


def list_for_account(db: Session, account_id: str, limit: int = 100) -> list[schemas.TransferOut]:
    rows = db.scalars(
        select(Transfer)
        .where(or_(Transfer.payer_account_id == account_id, Transfer.payee_account_id == account_id))
        .order_by(Transfer.created_at.desc())
        .limit(limit)
    )
    parties = Parties(db)
    return [to_dto(db, t, account_id, parties) for t in rows]


def find(db: Session, tx: str) -> Transfer:
    t = db.get(Transfer, tx)
    if t is None:
        raise ApiError(404, "not_found", "No payment with that ID.")
    return t


def get_visible(db: Session, viewer: Viewer, tx: str) -> Transfer:
    """Parties see their own payments; analysts and ops can see any."""
    t = find(db, tx)
    account_id = viewer.account.id if viewer.account else None
    if account_id not in (t.payer_account_id, t.payee_account_id) and viewer.role not in ("analyst", "ops"):
        raise ApiError(404, "not_found", "No payment with that ID.")
    return t


def detail(db: Session, viewer: Viewer, tx: str) -> schemas.TransferDetailOut:
    t = get_visible(db, viewer, tx)
    account_id = viewer.account.id if viewer.account else None
    parties = Parties(db)
    refunds = db.scalars(select(Transfer).where(Transfer.refund_of == t.tx).order_by(Transfer.created_at))
    can_see_risk = account_id == t.payer_account_id or viewer.role in ("analyst", "ops")
    return schemas.TransferDetailOut(
        transfer=to_dto(db, t, account_id, parties),
        refunds=[to_dto(db, r, account_id, parties) for r in refunds],
        risk=risk_dto(t) if can_see_risk else None,
    )


# ---- Commands -------------------------------------------------------------------


def _next_step(t: Transfer) -> str:
    return {"initiated": "step_up_required", "held": "held"}.get(t.status, "done")


def _claim_idempotency_key(db: Session, scope_key: str) -> Transfer | None:
    existing = db.get(IdempotencyKey, scope_key)
    return db.get(Transfer, existing.tx) if existing else None


def _assert_funds(db: Session, account_id: str, amount_minor: int) -> None:
    ledger.lock_account(db, account_id)
    if ledger.balance_of(db, account_id) < amount_minor:
        raise ApiError(422, "insufficient_funds", "Your balance is too low for this payment.")


def _settle(db: Session, t: Transfer, from_account: str, memo: str) -> None:
    ledger.post(db, memo, ledger.transfer_lines(from_account, t.payee_account_id, t.amount_minor), transfer_tx=t.tx)
    t.status = "settled"
    t.settled_at = now()


def create_payment(db: Session, viewer: Viewer, body: schemas.CreateTransferIn, idempotency_key: str) -> schemas.CreateTransferOut:
    """
    Pays a wallet on this platform (settles instantly on our ledger) or an account at
    another bank (goes through the switch). Both get a signed receipt and the same risk checks.
    """
    assert viewer.account is not None
    scope_key = f"{viewer.user.id}:payment:{idempotency_key}"
    if (existing := _claim_idempotency_key(db, scope_key)) is not None:
        return schemas.CreateTransferOut(transfer=to_dto(db, existing, viewer.account.id), next=_next_step(existing), risk=risk_dto(existing))

    if body.amount_minor <= 0:
        raise ApiError(422, "invalid_amount", "Enter an amount greater than zero.")
    payee = payees.for_payment(db, body)  # Name enquiry happens here, server-side, every time.
    if payee.account is not None and payee.account.id == viewer.account.id:
        raise ApiError(422, "self_payment", "You can't pay yourself.")
    _assert_funds(db, viewer.account.id, body.amount_minor)

    payee_account_id = payee.account.id if payee.account else ledger.NETWORK
    external = None if payee.on_platform else (payee.bank_code, payee.account_number)
    assessed = risk.assess(db, viewer.user, viewer.account.id, payee_account_id, body.amount_minor, external=external)
    t = Transfer(
        tx=new_id("tx"),
        kind="payment",
        refund_of=None,
        payer_account_id=viewer.account.id,
        payee_account_id=payee_account_id,
        amount_minor=body.amount_minor,
        currency=ledger.CURRENCY,
        refunded_minor=0,
        status="initiated",
        note=(body.note or "").strip()[:140] or None,
        rail="internal" if payee.on_platform else "interbank",
        counterparty_bank_code=None if payee.on_platform else payee.bank_code,
        counterparty_bank_name=None if payee.on_platform else payee.bank_name,
        counterparty_account_number=None if payee.on_platform else payee.account_number,
        counterparty_name=None if payee.on_platform else payee.account_name,
        risk_score=assessed.score,
        risk_band=assessed.band,
        risk_reasons=assessed.reasons,
        created_at=now(),
    )
    db.add(t)
    db.flush()
    db.add(IdempotencyKey(scope_key=scope_key, tx=t.tx))
    signing.issue_receipt(db, t)

    if assessed.band == "low":
        _release(db, t, from_account=viewer.account.id)
    elif assessed.band == "high":
        ledger.post(db, "Payment held for review", ledger.transfer_lines(viewer.account.id, ledger.SUSPENSE, t.amount_minor), transfer_tx=t.tx)
        t.status = "held"
        open_case(
            db,
            kind="held_transfer",
            title=f"Held payment: {viewer.user.display_name} → {payee.account_name}",
            transfer_tx=t.tx,
            risk_score=assessed.score,
            reasons=assessed.reasons,
            dedupe_key=f"held:{t.tx}",
        )
    try:
        db.flush()
    except IntegrityError as exc:  # A concurrent retry with the same key won.
        raise ApiError(409, "duplicate_request", "This payment is already being processed.") from exc
    return schemas.CreateTransferOut(transfer=to_dto(db, t, viewer.account.id), next=_next_step(t), risk=risk_dto(t))


def _release(db: Session, t: Transfer, *, from_account: str | None = None) -> None:
    """
    Moves an approved payment forward: settle internally, or hand it to the network.
    `from_account` is the payer's wallet; None means the funds already sit in suspense (a released hold).
    """
    if t.rail == "interbank":
        interbank.submit(db, t, funds_in_suspense=from_account is None)
    else:
        _settle(db, t, from_account or ledger.SUSPENSE, "Payment" if from_account else "Released from suspense")


def complete_step_up(db: Session, viewer: Viewer, tx: str, code: str) -> schemas.TransferOut:
    assert viewer.account is not None
    t = get_visible(db, viewer, tx)
    if t.payer_account_id != viewer.account.id or t.status != "initiated":
        raise ApiError(409, "not_awaiting_step_up", "This payment isn't waiting for verification.")
    if code.strip() != STEP_UP_DEMO_CODE:
        raise ApiError(422, "invalid_code", "That code is incorrect. Check it and try again.")
    _assert_funds(db, viewer.account.id, t.amount_minor)
    _release(db, t, from_account=viewer.account.id)
    return to_dto(db, t, viewer.account.id)


def refund(db: Session, viewer: Viewer, tx: str, amount_minor: int, idempotency_key: str) -> schemas.TransferOut:
    """A refund travels back along the original payment (§6.5)."""
    assert viewer.account is not None
    scope_key = f"{viewer.user.id}:refund:{idempotency_key}"
    if (existing := _claim_idempotency_key(db, scope_key)) is not None:
        return to_dto(db, existing, viewer.account.id)

    original = get_visible(db, viewer, tx)
    if original.payee_account_id != viewer.account.id or original.kind != "payment":
        raise ApiError(403, "not_payee", "Only the person who received this payment can refund it.")
    if original.status != "settled":
        raise ApiError(409, "refund_blocked", "You can refund this payment once it has settled.")
    if original.rail == "interbank":
        raise ApiError(409, "refund_unsupported", "Payments from other banks can't be refunded here yet. Send a new transfer to the sender instead.")
    refundable = original.amount_minor - original.refunded_minor
    if amount_minor <= 0 or amount_minor > refundable:
        raise ApiError(422, "invalid_amount", f"Enter an amount up to the {money(refundable)} not yet refunded.")
    _assert_funds(db, viewer.account.id, amount_minor)

    r = Transfer(
        tx=new_id("tx"),
        kind="refund",
        refund_of=original.tx,
        payer_account_id=original.payee_account_id,
        payee_account_id=original.payer_account_id,
        amount_minor=amount_minor,
        currency=original.currency,
        refunded_minor=0,
        status="initiated",
        note=f"Refund of {original.tx}",
        risk_score=0.02,
        risk_band="low",
        risk_reasons=[],
        created_at=now(),
    )
    db.add(r)
    db.flush()
    db.add(IdempotencyKey(scope_key=scope_key, tx=r.tx))
    signing.issue_receipt(db, r)
    _settle(db, r, viewer.account.id, f"Refund of {original.tx}")
    original.refunded_minor += amount_minor
    db.flush()
    return to_dto(db, r, viewer.account.id)


def confirm_received(db: Session, viewer: Viewer, tx: str) -> schemas.TransferOut:
    assert viewer.account is not None
    t = get_visible(db, viewer, tx)
    if t.payee_account_id != viewer.account.id:
        raise ApiError(403, "not_payee", "Only the person who received this payment can confirm it.")
    if t.status != "settled":
        raise ApiError(409, "not_settled", "You can confirm a payment once it has arrived.")
    if db.get(Confirmation, tx) is not None:
        raise ApiError(409, "already_confirmed", "You already confirmed this payment.")
    db.add(Confirmation(tx=tx, confirmed_by=viewer.user.id, confirmed_at=now()))
    db.flush()
    return to_dto(db, t, viewer.account.id)


# ---- Settlement changes (analyst decisions, sandbox rail) --------------------------


def settle_from_suspense(db: Session, tx: str) -> Transfer:
    """Releases a held payment (analyst decision) or settles a pending internal one (sandbox rail)."""
    t = find(db, tx)
    if t.status not in ("pending", "held"):
        raise ApiError(409, "not_pending", "Only pending or held payments can be settled.")
    if t.rail == "interbank" and t.status == "pending":
        raise ApiError(409, "network_managed", "Inter-bank payments are settled by the payment network.")
    _release(db, t)
    return t


def cancel_held(db: Session, tx: str) -> Transfer:
    t = find(db, tx)
    if t.status not in ("pending", "held"):
        raise ApiError(409, "not_held", "Only held or pending payments can be cancelled.")
    ledger.post(db, "Held payment cancelled, funds returned", ledger.transfer_lines(ledger.SUSPENSE, t.payer_account_id, t.amount_minor), transfer_tx=t.tx)
    t.status = "failed"
    return t


def reverse_payment(db: Session, tx: str) -> Transfer:
    """
    Reverses a settled payment (§6.4, §6.5). The payee only loses what they still
    hold; the refunded part is recovered from whoever received the refund.
    """
    t = find(db, tx)
    if t.rail == "interbank":
        raise ApiError(409, "network_managed", "Inter-bank reversals come from the payment network. Send an amount ending in .66 to see one.")
    if t.status != "settled" or t.kind != "payment":
        raise ApiError(409, "not_reversible", "Only settled payments can be reversed.")
    still_held = t.amount_minor - t.refunded_minor
    lines = [ledger.Line(ledger.REVERSALS, "CR", t.amount_minor)]
    if still_held > 0:
        lines.append(ledger.Line(t.payee_account_id, "DR", still_held))
    if t.refunded_minor > 0:
        lines.append(ledger.Line(t.payer_account_id, "DR", t.refunded_minor))
    ledger.post(db, "Payment reversed", lines, transfer_tx=t.tx)
    t.status = "reversed"
    t.reversed_at = now()

    if t.refunded_minor > 0 and ledger.balance_of(db, t.payer_account_id) < 0:
        open_case(
            db,
            kind="reversal_shortfall",
            title=f"Refund recovery shortfall: {Parties(db).name(t.payer_account_id)}",
            transfer_tx=t.tx,
            risk_score=None,
            reasons=["Payment reversed after a refund", "Refund recipient's balance is negative after recovery"],
            dedupe_key=f"shortfall:{t.tx}",
        )
    return t
