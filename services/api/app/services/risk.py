"""
Transfer risk (system_design.md §5.3, §6.2).

v1 is the policy engine's rules baseline. The LightGBM model replaces the
scoring in M6 and runs in shadow first; the bands and actions stay the same.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.formatting import now
from app.models import Transfer, User

SEND_BACK_WINDOW = timedelta(hours=72)
STEP_UP_AMOUNT_MINOR = 100_000  # $1,000


@dataclass(frozen=True)
class Risk:
    score: float
    band: str  # low | medium | high
    reasons: list[str]


def recent_payment(db: Session, from_account: str, to_account: str) -> Transfer | None:
    """A settled payment `from_account` made to `to_account` within the send-back window."""
    return db.scalar(
        select(Transfer)
        .where(
            Transfer.kind == "payment",
            Transfer.payer_account_id == from_account,
            Transfer.payee_account_id == to_account,
            Transfer.status == "settled",
            Transfer.created_at >= now() - SEND_BACK_WINDOW,
        )
        .order_by(Transfer.created_at.desc())
        .limit(1)
    )


def assess(db: Session, payer: User, payer_account: str, payee_account: str, amount_minor: int, external: tuple[str, str] | None = None) -> Risk:
    """`external` is (bank code, account number) when the payee is at another bank."""
    score = 0.04
    reasons: list[str] = []
    if amount_minor >= STEP_UP_AMOUNT_MINOR:
        score += 0.4
        reasons.append("Amount above $1,000")
    if payer.flagged:
        score += 0.45
        reasons.append("Account created recently and linked to a reversed payment")
    if external:
        same_payee = (Transfer.counterparty_bank_code == external[0]) & (Transfer.counterparty_account_number == external[1])
    else:
        same_payee = Transfer.payee_account_id == payee_account
    paid_before = db.scalar(select(exists().where(Transfer.payer_account_id == payer_account, same_payee)))
    if not paid_before:
        score += 0.1
        reasons.append("First payment to this payee")
    if not external and recent_payment(db, payee_account, payer_account) is not None:
        score += 0.15
        reasons.append("Sending money back to someone who paid you recently (use Refund instead)")
    score = min(0.99, round(score, 2))
    band = "high" if score >= 0.8 else "medium" if score >= 0.4 else "low"
    return Risk(score=score, band=band, reasons=reasons)
