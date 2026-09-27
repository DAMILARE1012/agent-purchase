"""
Paying for a cart (system_design.md §3 steps 3–4, M7).

approve() is the only way money leaves a shopper's balance for a purchase:

  1. If the cart already has a purchase, return it (a second click, a retry).
  2. Check the shopper's approval: a passkey assertion over the cart's hash.
  3. Ask the seller's bank who owns the payee account. It's a network call, so it
     happens before any row is locked.
  4. In one database transaction, locking the mandate, then the run, then the
     shopper's account (always in that order):
       - the run must still be waiting for approval;
       - the gate runs again on the mandate as it is now: cancelled, expired,
         no uses left, over a spending cap, a changed payee all refuse the payment;
       - the balance must cover the cart;
       - the mandate's use and spend are taken with a conditional UPDATE;
       - the funds are held (DR shopper, CR suspense) and the purchase is written
         with a signed receipt.
     The database backs this up on its own: purchases are unique per run, cart and
     transfer, and a CHECK constraint refuses a mandate used past its signed limits.
  5. After the commit, the transfer goes to the switch. Its outcome (straight
     away, by webhook, or by status query) arrives in on_transfer_update().
"""

import hashlib
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agent import releases, runtime, tools
from app.config import get_settings
from app.errors import ApiError
from app.formatting import new_id, now
from app.models import Account, AgentRun, Mandate, Merchant, Passkey, Purchase, RunStep, Transfer, User
from app.security import Viewer
from app.services import gate, interbank, ledger, mandates, merchants, network, passkeys, runqueue, signing

log = logging.getLogger("payments")

WAT = timedelta(hours=1)  # Periods (weekly and monthly caps) start at midnight in Lagos.
COUNTED = ("paying", "paid")  # Purchases that count against a mandate's caps.
WEB_STATUS = {"paying": "pending", "paid": "paid", "failed": "failed", "reversed": "reversed", "refunded": "refunded"}


def _money(minor: int) -> str:
    return f"₦{minor / 100:,.0f}" if minor % 100 == 0 else f"₦{minor / 100:,.2f}"


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def cart_hash(signed_cart: dict) -> str:
    """SHA-256 of exactly what the seller signed. The shopper's approval and the receipt commit to it."""
    return hashlib.sha256(merchants.canonical_json(signed_cart["cart"])).hexdigest()


# ---- Spending caps --------------------------------------------------------------------------------------


def period_start(period: str, at: datetime) -> datetime:
    local = at.astimezone(UTC) + WAT
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = day - timedelta(days=day.weekday()) if period == "week" else day.replace(day=1)
    return start - WAT


def period_spent_minor(db: Session, mandate: Mandate, at: datetime | None = None) -> int:
    """What this mandate has paid (or is paying) in the current week or month."""
    period = mandate.limits.get("period")
    if not period:
        return 0
    since = period_start(period, at or now())
    return int(
        db.scalar(
            select(func.coalesce(func.sum(Purchase.total_minor), 0)).where(
                Purchase.mandate_id == mandate.id, Purchase.status.in_(COUNTED), Purchase.created_at >= since
            )
        )
    )


# ---- Approving a cart -------------------------------------------------------------------------------------


def _run_for_cart(db: Session, viewer: Viewer, cart_id: str) -> AgentRun:
    run = db.scalar(select(AgentRun).where(AgentRun.cart_id == cart_id))
    if run is None or run.user_id != viewer.user.id or not run.signed_cart:
        raise ApiError(404, "not_found", "Cart not found.")
    return run


def _purchase_for_run(db: Session, run_id: str) -> Purchase | None:
    return db.scalar(select(Purchase).where(Purchase.run_id == run_id))


NOT_WAITING = {
    "declined": "You declined this cart, or its mandate was cancelled. Nothing was paid.",
    "blocked": "The gate refused this cart. Nothing was paid.",
    "queued": "The AI is still shopping.",
    "running": "The AI is still shopping.",
}


def _require_waiting(run: AgentRun) -> None:
    if run.status != "awaiting_approval":
        raise ApiError(409, "not_awaiting_approval", NOT_WAITING.get(run.status, "This cart isn't waiting for your approval."))


def approval_options(db: Session, viewer: Viewer, cart_id: str) -> dict:
    """The WebAuthn challenge for approving this exact cart (it commits to the cart's hash)."""
    run = _run_for_cart(db, viewer, cart_id)
    _require_waiting(run)
    return passkeys.signing_options(db, viewer, cart_hash(run.signed_cart), purpose="cart")


def _check_approval(db: Session, viewer: Viewer, digest: str, signature: dict) -> tuple[str, str, int | None]:
    """Returns (kind, evidence JSON, passkey id)."""
    kind = signature.get("kind")
    if kind == "passkey":
        if not (signature.get("challengeId") and signature.get("credential")):
            raise ApiError(422, "unapproved", "Approve the payment with your passkey first.")
        passkey, evidence = passkeys.verify_signature(db, viewer, signature["challengeId"], signature["credential"], digest, purpose="cart")
        return "passkey", json.dumps(evidence), passkey.id
    if kind == "test" and get_settings().allow_test_signatures and viewer.client_id == "scan-cli":
        return (
            "test",
            json.dumps(
                {
                    "kind": "test",
                    "purpose": "cart",
                    "client": viewer.client_id,
                    "note": "Sandbox test approval from the scan-cli test client; not a passkey.",
                }
            ),
            None,
        )
    raise ApiError(403, "passkey_required", "Payments must be approved with your passkey.")


def approve(db: Session, viewer: Viewer, cart_id: str, signature: dict) -> Purchase:
    run = _run_for_cart(db, viewer, cart_id)
    if (existing := _purchase_for_run(db, run.id)) is not None:
        return existing
    _require_waiting(run)
    if viewer.account is None:
        raise ApiError(403, "no_wallet", "This account doesn't have a balance to pay from.")
    signed = run.signed_cart
    digest = cart_hash(signed)
    approval_kind, approval, passkey_id = _check_approval(db, viewer, digest, signature)

    at = now()
    verification = merchants.verify_cart(db, signed, at)  # Network call: before any lock.

    # Locks, always in this order: mandate → run → account.
    mandate = db.scalars(
        select(Mandate).where(Mandate.id == run.mandate_id).with_for_update().execution_options(populate_existing=True)
    ).one()
    run = db.scalars(select(AgentRun).where(AgentRun.id == run.id).with_for_update().execution_options(populate_existing=True)).one()
    if (existing := _purchase_for_run(db, run.id)) is not None:  # A concurrent approval won while we waited for the lock.
        db.rollback()
        return existing
    _require_waiting(run)

    mandates.refresh_status(mandate)
    decision = gate.decide(db, mandate, signed, period_spent_minor=period_spent_minor(db, mandate, at), at=at, verification=verification)
    if decision["outcome"] == "deny":
        _refuse(db, run, decision)
        failed = [c for c in decision["checks"] if c["result"] == "fail"]
        raise ApiError(
            409,
            "gate_refused",
            "The gate refused the payment: " + "; ".join(c["detail"].rstrip(".") for c in failed) + ". Nothing was paid.",
            {"decision": runtime.decision_view(decision)},
        )

    cart = signed["cart"]
    total = int(cart["totalMinor"])
    ledger.lock_account(db, viewer.account.id)
    if ledger.balance_of(db, viewer.account.id) < total:
        raise ApiError(
            422,
            "insufficient_funds",
            f"Your balance is too low for this {_money(total)} cart. Add money, then approve again. Nothing was paid.",
        )

    # Take the use and the spend only if the mandate still allows it. With the row locked this always
    # matches after the gate passed; the condition (and the database's CHECK constraint) guard against any other path.
    max_uses = int(mandate.limits.get("maxUses", 1))
    taken = db.execute(
        update(Mandate)
        .where(Mandate.id == mandate.id, Mandate.status == "active", Mandate.uses < max_uses)
        .values(
            uses=Mandate.uses + 1,
            spent_minor=Mandate.spent_minor + total,
            status=case((Mandate.uses + 1 >= max_uses, "used_up"), else_="active"),
        )
        .execution_options(synchronize_session=False)
    )
    if taken.rowcount != 1:
        raise ApiError(409, "mandate_used_up", "This mandate has no uses left. Nothing was paid.")

    purchase = _record_payment(db, viewer, run, mandate, signed, digest, decision, verification, approval_kind, approval, passkey_id, at)
    try:
        db.commit()
    except IntegrityError:  # Unique per run and cart: another approval committed first.
        db.rollback()
        if (existing := _purchase_for_run(db, run.id)) is not None:
            return existing
        raise
    runqueue.publish(run.id)

    transfer = db.get(Transfer, purchase.transfer_tx)
    if transfer is not None and transfer.rail == "interbank":
        interbank.send(db, transfer)  # The outcome comes back through on_transfer_update().
        db.commit()
    return purchase


def _refuse(db: Session, run: AgentRun, decision: dict) -> None:
    """The gate said no at the moment of payment: the run ends blocked, nothing is paid."""
    details = [c["detail"] for c in decision["checks"] if c["result"] == "fail"]
    run.status, run.ended_at, run.decision = "blocked", now(), runtime.decision_view(decision)
    run.outcome_note = (
        "The gate refused the payment when you approved it: " + ". ".join(d.rstrip(".") for d in details) + ". Nothing was paid."
    )
    _step(
        db,
        run,
        "gate",
        "Gate checked the cart again at payment and refused it: " + "; ".join(details),
        detail={"gateVersion": decision["gateVersion"]},
    )
    db.commit()
    runqueue.publish(run.id)


def _step(db: Session, run: AgentRun, kind: str, summary: str, detail: dict | None = None) -> None:
    seq = int(db.scalar(select(func.coalesce(func.max(RunStep.seq), 0)).where(RunStep.run_id == run.id))) + 1
    db.add(
        RunStep(
            run_id=run.id,
            seq=seq,
            kind=kind,
            summary=summary[:1000],
            seller_id=(run.signed_cart or {}).get("cart", {}).get("sellerId"),
            untrusted=False,
            tokens_in=0,
            tokens_out=0,
            latency_ms=0,
            cost_micro_usd=0,
            detail=detail,
        )
    )


def _record_payment(
    db: Session,
    viewer: Viewer,
    run: AgentRun,
    mandate: Mandate,
    signed: dict,
    digest: str,
    decision: dict,
    verification: dict,
    approval_kind: str,
    approval: str,
    passkey_id: int | None,
    at: datetime,
) -> Purchase:
    """Holds the funds and writes the transfer, the purchase and its signed receipt. Part of approve()'s transaction."""
    assert viewer.account is not None
    cart = signed["cart"]
    total, payee = int(cart["totalMinor"]), cart["payee"]
    merchant = db.get(Merchant, cart["sellerId"])
    assert merchant is not None  # The gate refuses carts from sellers outside the directory.
    payee_name = (verification.get("payeeName") or merchant.legal_name).upper()
    purchase_id = new_id("pur")
    platform_bank = get_settings().platform_bank_code

    internal_payee = None
    if payee["bankCode"] == platform_bank:
        internal_payee = db.scalar(select(Account).where(Account.account_number == payee["accountNumber"]))
        if internal_payee is None:
            raise ApiError(409, "payee_missing", "The seller's account at this platform no longer exists. Nothing was paid.")
    bank_name = next((b.name for b in network.banks() if b.code == payee["bankCode"]), payee["bankCode"])

    t = Transfer(
        tx=new_id("tx"),
        kind="payment",
        refund_of=None,
        payer_account_id=viewer.account.id,
        payee_account_id=internal_payee.id if internal_payee else ledger.NETWORK,
        amount_minor=total,
        currency=ledger.CURRENCY,
        refunded_minor=0,
        status="pending",
        note=f"{merchant.display_name} · purchase {purchase_id}"[:200],
        rail="internal" if internal_payee else "interbank",
        counterparty_bank_code=None if internal_payee else payee["bankCode"],
        counterparty_bank_name=None if internal_payee else bank_name,
        counterparty_account_number=None if internal_payee else payee["accountNumber"],
        counterparty_name=None if internal_payee else payee_name,
        network_status=None if internal_payee else "submitted",
        # The gate decides purchases, not the P2P risk model.
        risk_score=0.0,
        risk_band="low",
        risk_reasons=[],
        created_at=at,
    )
    db.add(t)
    db.flush()
    ledger.post(
        db, f"Purchase hold: {merchant.display_name}", ledger.transfer_lines(viewer.account.id, ledger.SUSPENSE, total), transfer_tx=t.tx
    )

    token, kid = signing.sign_purchase(
        db,
        purchase_id=purchase_id,
        tx=t.tx,
        amount_minor=total,
        currency=ledger.CURRENCY,
        seller_id=merchant.id,
        payee_reference=f"{payee['bankCode']}:{payee['accountNumber']}",
        mandate_hash=mandate.mandate_hash,
        cart_hash=digest,
        gate_version=decision["gateVersion"],
        agent_version=run.release_id,
        created_at=at,
    )
    summary = ", ".join(f"{ln['quantity']} × {ln['name']}" for ln in cart["lines"])
    purchase = Purchase(
        id=purchase_id,
        run_id=run.id,
        cart_id=cart["cartId"],
        mandate_id=mandate.id,
        user_id=viewer.user.id,
        merchant_id=merchant.id,
        transfer_tx=t.tx,
        total_minor=total,
        currency=ledger.CURRENCY,
        summary=summary[:300],
        status="paying",
        payee_bank_code=payee["bankCode"],
        payee_account_number=payee["accountNumber"],
        payee_name=payee_name,
        mandate_hash=mandate.mandate_hash,
        cart_hash=digest,
        gate_version=decision["gateVersion"],
        agent_version=run.release_id,
        decision=runtime.decision_view(decision),
        approval_kind=approval_kind,
        approval=approval,
        passkey_id=passkey_id,
        receipt_token=token,
        receipt_kid=kid,
        created_at=at,
    )
    db.add(purchase)

    run.status, run.purchase_id, run.decision = "paying", purchase_id, runtime.decision_view(decision)
    how = "your passkey" if approval_kind == "passkey" else "a sandbox test approval"
    _step(
        db,
        run,
        "payment",
        f"You approved {_money(total)} with {how}. The gate checked the cart again and allowed it; "
        f"paying {payee_name}, {bank_name} ••••{payee['accountNumber'][-4:]}.",
        detail={"purchaseId": purchase_id, "tx": t.tx},
    )
    db.flush()

    if internal_payee is not None:  # On-platform seller: settles now, in this transaction.
        ledger.post(db, "Purchase paid", ledger.transfer_lines(ledger.SUSPENSE, internal_payee.id, total), transfer_tx=t.tx)
        t.status, t.settled_at = "settled", at
        on_transfer_update(db, t)
    return purchase


# ---- Outcomes from the bank -------------------------------------------------------------------------------


def on_transfer_update(db: Session, t: Transfer) -> None:
    """Moves the purchase and its run to the transfer's outcome. Called for every transfer; ignores non-purchases."""
    p = db.scalar(select(Purchase).where(Purchase.transfer_tx == t.tx).with_for_update().execution_options(populate_existing=True))
    if p is None:
        return
    run = db.get(AgentRun, p.run_id)
    assert run is not None
    session = f" Bank session ID {t.network_session_id}." if t.network_session_id else ""
    if t.status == "settled" and p.status == "paying":
        p.status, p.paid_at, p.ended_at = "paid", t.settled_at or now(), now()
        run.status, run.ended_at = "paid", now()
        run.outcome_note = f"Paid {_money(p.total_minor)} to {p.payee_name}.{session}"
        _step(db, run, "payment", f"The bank confirmed the payment.{session}", detail={"purchaseId": p.id, "tx": t.tx})
    elif t.status == "failed" and p.status == "paying":
        p.status, p.ended_at = "failed", now()
        run.status, run.ended_at = "failed", now()
        run.outcome_note = "The bank transfer failed. Nothing was paid; the money is back in your balance."
        _step(
            db, run, "payment", "The bank transfer failed; the held money went back to the shopper's balance.", detail={"purchaseId": p.id}
        )
        _release_mandate(db, p)
    elif t.status == "reversed" and p.status in COUNTED:
        p.status, p.ended_at = "reversed", now()
        run.status, run.ended_at = "failed", now()
        run.outcome_note = "The seller's bank reversed the payment. The money is back in your balance."
        _step(db, run, "payment", f"The seller's bank reversed the payment.{session}", detail={"purchaseId": p.id})
        _release_mandate(db, p)
    else:
        return
    db.flush()
    runqueue.publish_after_commit(db, run.id)


def _release_mandate(db: Session, p: Purchase) -> None:
    """A purchase that didn't go through gives its use and spend back to the mandate."""
    db.execute(
        update(Mandate)
        .where(Mandate.id == p.mandate_id, Mandate.uses >= 1, Mandate.spent_minor >= p.total_minor)
        .values(
            uses=Mandate.uses - 1,
            spent_minor=Mandate.spent_minor - p.total_minor,
            status=case((Mandate.status == "used_up", "active"), else_=Mandate.status),
        )
        .execution_options(synchronize_session=False)
    )


# ---- Reading purchases ------------------------------------------------------------------------------------


def get_visible(db: Session, viewer: Viewer, purchase_id: str) -> Purchase:
    p = db.get(Purchase, purchase_id)
    if p is None or (p.user_id != viewer.user.id and viewer.role not in ("analyst", "ops")):
        raise ApiError(404, "not_found", "Purchase not found.")
    return p


def list_own(db: Session, viewer: Viewer) -> list[Purchase]:
    return list(db.scalars(select(Purchase).where(Purchase.user_id == viewer.user.id).order_by(Purchase.created_at.desc()).limit(200)))


def purchase_out(db: Session, p: Purchase) -> dict:
    """The Purchase shape the web app uses (web/src/types/domain.ts)."""
    run = db.get(AgentRun, p.run_id)
    merchant = db.get(Merchant, p.merchant_id)
    shopper = db.get(User, p.user_id)
    transfer = db.get(Transfer, p.transfer_tx)
    payee = (run.cart_view or {}).get("payee") if run else None
    return {
        "id": p.id,
        "runId": p.run_id,
        "mandateId": p.mandate_id,
        "shopperName": shopper.display_name if shopper else "Shopper",
        "sellerId": p.merchant_id,
        "sellerName": merchant.display_name if merchant else p.merchant_id,
        "summary": p.summary,
        "totalMinor": p.total_minor,
        "status": WEB_STATUS[p.status],
        "paidAt": iso(p.paid_at or p.created_at),
        "lines": (run.cart_view or {}).get("lines", []) if run else [],
        "deliveryBy": (run.cart_view or {}).get("deliveryBy") if run else None,
        "payee": {**(payee or {}), "nameOnAccount": p.payee_name},
        "receipt": {
            "id": p.id,
            "token": p.receipt_token,
            "issuedAt": iso(p.created_at),
            "mandateHash": p.mandate_hash,
            "cartHash": p.cart_hash,
            "gateVersion": p.gate_version,
            "agentVersion": p.agent_version,
            "networkSessionId": (transfer.network_session_id if transfer else None) or "",
            "signingKeyId": p.receipt_kid,
            "approvalKind": p.approval_kind,
        },
    }


def count_since(db: Session, since: datetime) -> int:
    return int(db.scalar(select(func.count()).select_from(Purchase).where(Purchase.created_at >= since, Purchase.status.in_(COUNTED))))


def violations_since(db: Session, since: datetime) -> int:
    """
    Purchases that broke their mandate: over its amount, after its expiry, or without the gate's allow.
    Should always be 0; ops alert on anything else. Checked from the stored records, independently of the payment path.
    """
    rows = db.execute(
        select(Purchase, Mandate)
        .join(Mandate, Mandate.id == Purchase.mandate_id)
        .where(Purchase.created_at >= since, Purchase.status.in_(COUNTED))
    ).all()
    bad = 0
    for p, m in rows:
        expires = datetime.fromisoformat(str(m.limits["expiresAt"]).replace("Z", "+00:00"))
        bad += (
            p.total_minor > int(m.limits.get("maxTotalMinor", 0))
            or p.created_at > expires
            or p.decision.get("outcome") == "deny"
            or p.mandate_hash != m.mandate_hash
        )
    return bad


# ---- Receipts anyone can check ------------------------------------------------------------------------------


def verify_receipt(db: Session, token: str) -> dict:
    """
    Public: a seller (or anyone) holding a receipt checks it. Everything is re-derived
    from stored evidence: the platform's signature, the shopper's passkey approval over
    the cart, the mandate's signature, the seller's signature over the cart, and the bank.
    """

    def invalid(detail: str) -> dict:
        return {"valid": False, "purchase": None, "checks": [{"label": "Platform signature", "result": "fail", "detail": detail}]}

    parsed = signing.parse_token(token, signing.PURCHASE_PREFIX)
    if parsed is None:
        return invalid("This isn't a Mandate Gate purchase receipt.")
    if signing.verify_signature(db, parsed) != "pass":
        return invalid("This receipt wasn't issued by the platform, or it was altered.")
    payload = parsed.payload
    p = db.get(Purchase, str(payload.get("p")))
    if p is None or p.receipt_token != token.strip():
        return invalid("The signature is the platform's, but no purchase matches this receipt.")

    checks = [{"label": "Platform signature", "result": "pass", "detail": f"Signed with key {p.receipt_kid}"}]

    key = db.get(Passkey, p.passkey_id) if p.passkey_id else None
    if p.approval_kind == "passkey":
        ok = key is not None and passkeys.reverify(p.approval, p.cart_hash, key.public_key, purpose="cart")
        checks.append(
            {
                "label": "Shopper approved this cart",
                "result": "pass" if ok else "fail",
                "detail": "The shopper's passkey signed this exact cart" if ok else "The shopper's approval doesn't verify",
            }
        )
    else:
        checks.append(
            {"label": "Shopper approved this cart", "result": "warn", "detail": "Approved by a sandbox test script, not a passkey"}
        )

    mandate = db.get(Mandate, p.mandate_id)
    mandate_ok = mandate is not None and mandates.canonical_hash(mandate.mode, mandate.limits) == p.mandate_hash == payload.get("m")
    mandate_key = db.get(Passkey, mandate.passkey_id) if mandate is not None and mandate.passkey_id else None
    if mandate_ok and mandate is not None and mandate.signature_kind == "passkey":
        mandate_ok = mandate_key is not None and passkeys.reverify(mandate.assertion, p.mandate_hash, mandate_key.public_key)
        checks.append(
            {
                "label": "Shopper's mandate",
                "result": "pass" if mandate_ok else "fail",
                "detail": f"Bound to mandate {p.mandate_hash[:12]}…, signed with the shopper's passkey"
                if mandate_ok
                else "The mandate's signature doesn't verify",
            }
        )
    else:
        checks.append(
            {
                "label": "Shopper's mandate",
                "result": "warn" if mandate_ok else "fail",
                "detail": f"Bound to mandate {p.mandate_hash[:12]}…, signed by a sandbox test script"
                if mandate_ok
                else "The mandate doesn't match the receipt",
            }
        )

    run = db.get(AgentRun, p.run_id)
    signed = run.signed_cart if run else None
    merchant = db.get(Merchant, p.merchant_id)
    cart_ok = (
        bool(signed)
        and merchant is not None
        and cart_hash(signed) == p.cart_hash == payload.get("c")
        and merchants.cart_signature_ok(merchant, signed)
    )
    checks.append(
        {
            "label": "Seller's cart",
            "result": "pass" if cart_ok else "fail",
            "detail": f"Signed by {merchant.display_name if merchant else 'the seller'} with its registered key"
            if cart_ok
            else "The cart doesn't match the seller's signature",
        }
    )

    checks.append(
        {
            "label": "Gate decision",
            "result": "pass" if p.decision.get("outcome") != "deny" else "fail",
            "detail": f"Allowed by {p.gate_version} at the moment of payment",
        }
    )

    transfer = db.get(Transfer, p.transfer_tx)
    session = transfer.network_session_id if transfer and transfer.network_session_id else None
    bank = {
        "paid": ("pass", f"Paid{f'; bank session ID {session}' if session else ' on the platform'}"),
        "paying": ("warn", "The bank hasn't confirmed the payment yet. Don't ship until it has."),
        "refunded": ("warn", "Paid, then refunded"),
        "failed": ("fail", "The bank transfer failed. Nothing was paid."),
        "reversed": ("fail", "The seller's bank reversed the payment."),
    }[p.status]
    checks.append({"label": "Bank payment", "result": bank[0], "detail": bank[1]})

    return {
        "valid": all(c["result"] != "fail" for c in checks),
        "purchase": {
            "id": p.id,
            "sellerName": merchant.display_name if merchant else p.merchant_id,
            "summary": p.summary,
            "totalMinor": p.total_minor,
            "status": WEB_STATUS[p.status],
            "paidAt": iso(p.paid_at or p.created_at),
        },
        "checks": checks,
    }


# ---- The seller's view ------------------------------------------------------------------------------------------


def seller_orders(db: Session, viewer: Viewer) -> list[dict]:
    """Paid purchases from the seller's store. Paying ones aren't shown: don't ship before the bank confirms."""
    merchant = merchants.owned_by(db, viewer.user.username)
    rows = db.scalars(
        select(Purchase)
        .where(Purchase.merchant_id == merchant.id, Purchase.status.in_(("paid", "refunded")))
        .order_by(Purchase.created_at.desc())
        .limit(300)
    ).all()
    out = []
    for p in rows:
        run = db.get(AgentRun, p.run_id)
        mandate = db.get(Mandate, p.mandate_id)
        shares_name = bool(((mandate.limits if mandate else {}).get("shareDelivery") or {}).get("name"))
        shopper = db.get(User, p.user_id) if shares_name else None
        out.append(
            {
                "id": f"o_{p.id}",
                "purchaseId": p.id,
                "receiptToken": p.receipt_token,
                "shopperName": shopper.display_name if shopper else "A shopper (name not shared)",
                "summary": p.summary,
                "totalMinor": p.total_minor,
                "paidAt": iso(p.paid_at or p.created_at),
                "deliverBy": (run.cart_view or {}).get("deliveryBy") if run else None,
                "status": "refunded" if p.status == "refunded" else "to_fulfil",
            }
        )
    return out


# ---- Sandbox: carts without the AI (concurrency and access tests) ----------------------------------------------


def sandbox_run(db: Session, viewer: Viewer, mandate_id: str, seller_id: str, lines: list[dict]) -> AgentRun:
    """
    Sandbox only: asks a seller for a signed cart directly and puts it through the gate, as if
    the AI had proposed it. Lets tests create many carts on one mandate without spending tokens.
    """
    m = mandates.get_own(db, viewer, mandate_id)
    if m.user_id != viewer.user.id:
        raise ApiError(403, "forbidden", "Only the shopper can shop with their mandate.")
    if m.status != "active":
        raise ApiError(409, "mandate_inactive", "This mandate can't be used.")
    signed = tools.create_cart(seller_id, lines, m.limits.get("deliveryCity", "Lagos"))
    verdict = gate.decide(db, m, signed)
    run = AgentRun(
        id="r_" + secrets.token_hex(8),
        mandate_id=m.id,
        user_id=viewer.user.id,
        release_id=releases.live().id,
        status="blocked" if verdict["outcome"] == "deny" else "awaiting_approval",
        priority="interactive",
        began_at=now(),
        ended_at=now() if verdict["outcome"] == "deny" else None,
        signed_cart=signed,
        cart_id=signed["cart"]["cartId"],
        cart_view=runtime.cart_view(db, signed, verdict),
        decision=runtime.decision_view(verdict),
        tokens=0,
        cost_micro_usd=0,
        latency_ms=0,
        outcome_note="Sandbox test cart refused by the gate." if verdict["outcome"] == "deny" else None,
    )
    db.add(run)
    db.flush()
    _step(db, run, "request_cart", f"Sandbox test cart from {signed['cart'].get('sellerName', seller_id)} (no AI)")
    _step(db, run, "gate", f"Gate decision: {verdict['outcome']}")
    db.commit()
    return run
