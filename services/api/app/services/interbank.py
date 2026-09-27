"""
Inter-bank payments through the switch.

Outbound (a wallet pays someone at another bank):
  submit       DR payer      CR suspense   money leaves the wallet, outcome unknown
  successful   DR suspense   CR network    the network confirmed delivery; we owe the network until settlement
  failed       DR suspense   CR payer      funds returned
  reversed     DR network    CR payer      the recipient's bank sent it back

Inbound (someone at another bank pays a wallet):
  credit       DR network    CR payee      the network owes us until settlement

A timeout never fails a payment: it stays pending until a webhook or a status
query settles it one way or the other.

Purchases (M7) hold the funds and commit first, then call send(): if the process
dies in between, the payment is pending with no network record, and the resolver
submits it (the switch is idempotent by our reference). Every outcome is passed
to payments.on_transfer_update, which moves the purchase and the run along.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.errors import ApiError
from app.formatting import new_id, now
from app.models import Account, Transfer, User
from app.services import ledger, network, signing
from app.services.parties import Parties

log = logging.getLogger("interbank")

STALE_AFTER = timedelta(seconds=20)


def _payload(db: Session, t: Transfer) -> dict:
    payer = Parties(db).summary(t.payer_account_id)
    return {
        "reference": t.tx,
        "fromBankCode": get_settings().platform_bank_code,
        "fromAccountNumber": payer.account_number,
        "fromName": payer.display_name,
        "toBankCode": t.counterparty_bank_code,
        "toAccountNumber": t.counterparty_account_number,
        "amountMinor": t.amount_minor,
        "narration": t.note,
    }


def submit(db: Session, t: Transfer, *, funds_in_suspense: bool = False) -> None:
    """Holds the funds (unless already held) and sends an outbound payment to the network."""
    if not funds_in_suspense:
        ledger.post(db, f"Inter-bank transfer to {t.counterparty_bank_name}", ledger.transfer_lines(t.payer_account_id, ledger.SUSPENSE, t.amount_minor), transfer_tx=t.tx)
    t.status = "pending"
    t.network_status = "submitted"
    db.flush()
    send(db, t)


def send(db: Session, t: Transfer) -> None:
    """Sends a pending, held payment to the network and applies whatever it answers. Safe to repeat."""
    try:
        remote = network.submit_transfer(_payload(db, t))
    except network.NetworkUnavailable:
        t.network_status = "unknown"  # The resolver will ask the network.
        return
    except ApiError as exc:
        _fail(db, t, f"Rejected by the network: {exc.message}")
        _after_update(db, t)
        return
    apply_update(db, t, remote)


def _confirm(db: Session, t: Transfer) -> None:
    ledger.post(db, f"Confirmed by {t.counterparty_bank_name}", ledger.transfer_lines(ledger.SUSPENSE, ledger.NETWORK, t.amount_minor), transfer_tx=t.tx)
    t.status = "settled"
    t.settled_at = now()
    t.network_status = "successful"


def _fail(db: Session, t: Transfer, memo: str = "Inter-bank transfer failed, funds returned") -> None:
    ledger.post(db, memo, ledger.transfer_lines(ledger.SUSPENSE, t.payer_account_id, t.amount_minor), transfer_tx=t.tx)
    t.status = "failed"
    t.network_status = "failed"


def _reverse(db: Session, t: Transfer) -> None:
    ledger.post(db, f"Reversed by {t.counterparty_bank_name}, funds returned", ledger.transfer_lines(ledger.NETWORK, t.payer_account_id, t.amount_minor), transfer_tx=t.tx)
    t.status = "reversed"
    t.reversed_at = now()
    t.network_status = "reversed"


def apply_update(db: Session, t: Transfer, remote: dict) -> None:
    """Moves an outbound payment to the network's reported state. Safe to call repeatedly, and concurrently."""
    # Lock and re-read: a webhook and the resolver may report the same outcome at the same time.
    db.refresh(t, with_for_update=True)
    t.network_session_id = t.network_session_id or remote.get("sessionId")
    status = remote.get("status")
    if t.status == "pending":
        if status == "pending":
            t.network_status = "pending"
        elif status == "successful":
            _confirm(db, t)
        elif status == "failed":
            _fail(db, t)
        elif status == "reversed":
            _confirm(db, t)
            _reverse(db, t)
    elif t.status == "settled" and status == "reversed":
        _reverse(db, t)
    db.flush()
    _after_update(db, t)


def _after_update(db: Session, t: Transfer) -> None:
    from app.services import payments  # Local import: payments builds on this module.

    payments.on_transfer_update(db, t)


def credit_inbound(db: Session, data: dict) -> Transfer:
    """Someone at another bank paid one of our wallets. Idempotent by network session ID."""
    existing = db.scalar(select(Transfer).where(Transfer.network_session_id == data["sessionId"]))
    if existing:
        return existing
    row = db.execute(
        select(Account, User).join(User, User.id == Account.user_id).where(Account.account_number == data["toAccountNumber"])
    ).first()
    if row is None:
        raise ApiError(404, "account_not_found", "No account with that number.")
    account, _user = row
    t = Transfer(
        tx=new_id("tx"),
        kind="payment",
        refund_of=None,
        payer_account_id=ledger.NETWORK,
        payee_account_id=account.id,
        amount_minor=int(data["amountMinor"]),
        currency=ledger.CURRENCY,
        refunded_minor=0,
        status="settled",
        note=data.get("narration") or None,
        rail="interbank",
        counterparty_bank_code=data["fromBankCode"],
        counterparty_bank_name=_bank_name(data["fromBankCode"]),
        counterparty_account_number=data["fromAccountNumber"],
        counterparty_name=data["fromName"],
        network_session_id=data["sessionId"],
        network_status="successful",
        risk_score=0.04,
        risk_band="low",
        risk_reasons=[],
        created_at=now(),
        settled_at=now(),
    )
    db.add(t)
    db.flush()
    ledger.post(db, f"Inter-bank transfer received from {t.counterparty_bank_name}", ledger.transfer_lines(ledger.NETWORK, account.id, t.amount_minor), transfer_tx=t.tx)
    signing.issue_receipt(db, t)
    return t


def _bank_name(code: str) -> str:
    return next((b.name for b in network.banks() if b.code == code), f"Bank {code}")


def resolve_stale_pending() -> int:
    """Asks the network about payments with no outcome yet (webhook lost, timeout). Returns how many changed."""
    changed = 0
    with SessionLocal() as db:
        stale = db.scalars(
            select(Transfer)
            .where(Transfer.rail == "interbank", Transfer.status == "pending", Transfer.created_at < now() - STALE_AFTER)
            .limit(25)
        ).all()
        for t in stale:
            try:
                remote = network.transfer_status(t.tx)
                if remote is None:  # Never reached the network: resubmit (idempotent by reference).
                    remote = network.submit_transfer(_payload(db, t))
            except (network.NetworkUnavailable, ApiError) as exc:
                log.warning("Status query for %s failed: %s", t.tx, exc)
                continue
            before = t.status
            apply_update(db, t, remote)
            db.commit()
            changed += before != t.status
    return changed
