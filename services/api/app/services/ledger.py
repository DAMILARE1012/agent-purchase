"""
Double-entry ledger (system_design.md §5.2, §9).

Every money movement is one JournalEntry whose lines balance (debits = credits).
Lines are never updated or deleted; corrections are new entries.
User balance = credits − debits.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.formatting import new_id, now
from app.models import Account, JournalEntry, LedgerLine

# Shopping is in naira, so every account and transfer is (moved from USD in M7).
CURRENCY = "NGN"

FUNDING = "acct_funding"
SUSPENSE = "acct_suspense"
REVERSALS = "acct_reversals"
# What the platform owes the payment network (credit) or is owed by it (debit) until end-of-day settlement.
NETWORK = "acct_network"

SYSTEM_ACCOUNTS = {
    FUNDING: "Sandbox funding",
    SUSPENSE: "Suspense (pending and held payments)",
    REVERSALS: "Reversals clearing",
    NETWORK: "Inter-bank network settlement",
}


@dataclass(frozen=True)
class Line:
    account_id: str
    direction: Literal["DR", "CR"]
    amount_minor: int


def ensure_system_accounts(db: Session) -> None:
    for account_id, name in SYSTEM_ACCOUNTS.items():
        if db.get(Account, account_id) is None:
            db.add(Account(id=account_id, user_id=None, kind="system", name=name, currency=CURRENCY))
    db.flush()


def post(db: Session, memo: str, lines: list[Line], transfer_tx: str | None = None, at: datetime | None = None) -> JournalEntry:
    """Posts one balanced journal entry, or raises if it doesn't balance."""
    if any(line.amount_minor <= 0 for line in lines):
        raise ValueError("Ledger lines must have positive amounts")
    debits = sum(line.amount_minor for line in lines if line.direction == "DR")
    credits = sum(line.amount_minor for line in lines if line.direction == "CR")
    if debits != credits:
        raise ValueError(f"Unbalanced journal entry: DR {debits} != CR {credits}")

    entry = JournalEntry(id=new_id("jr"), transfer_tx=transfer_tx, memo=memo, created_at=at or now())
    db.add(entry)
    db.flush()
    for line in lines:
        db.add(LedgerLine(journal_id=entry.id, account_id=line.account_id, direction=line.direction, amount_minor=line.amount_minor))
    db.flush()
    return entry


def transfer_lines(from_account: str, to_account: str, amount_minor: int) -> list[Line]:
    return [Line(from_account, "DR", amount_minor), Line(to_account, "CR", amount_minor)]


_signed = case((LedgerLine.direction == "CR", LedgerLine.amount_minor), else_=-LedgerLine.amount_minor)


def balance_of(db: Session, account_id: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(_signed), 0)).where(LedgerLine.account_id == account_id)))


def lock_account(db: Session, account_id: str) -> None:
    """Row lock so two concurrent payments can't both spend the same balance."""
    db.execute(select(Account.id).where(Account.id == account_id).with_for_update())
