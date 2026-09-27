"""Read-only views of the platform ledger for the ops (finance) role."""

from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app import schemas
from app.models import Account, JournalEntry, LedgerLine, Transfer, User
from app.services import ledger

_dr = func.coalesce(func.sum(case((LedgerLine.direction == "DR", LedgerLine.amount_minor), else_=0)), 0)
_cr = func.coalesce(func.sum(case((LedgerLine.direction == "CR", LedgerLine.amount_minor), else_=0)), 0)


def accounts(db: Session) -> list[schemas.LedgerAccountOut]:
    totals = dict(
        (row.account_id, (int(row.dr), int(row.cr)))
        for row in db.execute(select(LedgerLine.account_id, _dr.label("dr"), _cr.label("cr")).group_by(LedgerLine.account_id))
    )
    rows = db.execute(select(Account, User.username).outerjoin(User, User.id == Account.user_id).order_by(Account.kind.desc(), Account.id))
    out = []
    for account, username in rows:
        dr, cr = totals.get(account.id, (0, 0))
        out.append(schemas.LedgerAccountOut(
            id=account.id,
            kind=account.kind,
            name=account.name,
            owner_handle=f"@{username}" if username else None,
            currency=account.currency,
            debits_minor=dr,
            credits_minor=cr,
            balance_minor=cr - dr,
        ))
    return out


def summary(db: Session) -> schemas.LedgerSummaryOut:
    all_accounts = accounts(db)
    total_dr = sum(a.debits_minor for a in all_accounts)
    total_cr = sum(a.credits_minor for a in all_accounts)
    by_id = {a.id: a for a in all_accounts}

    def system_balance(account_id: str) -> int:
        a = by_id.get(account_id)
        return a.balance_minor if a else 0

    counts = dict(db.execute(select(Transfer.status, func.count()).group_by(Transfer.status)).all())
    return schemas.LedgerSummaryOut(
        total_debits_minor=total_dr,
        total_credits_minor=total_cr,
        balanced=total_dr == total_cr,
        customer_balances_minor=sum(a.balance_minor for a in all_accounts if a.kind == "user"),
        in_suspense_minor=system_balance(ledger.SUSPENSE),
        funded_minor=-system_balance(ledger.FUNDING),
        reversed_minor=system_balance(ledger.REVERSALS),
        journal_count=int(db.scalar(select(func.count()).select_from(JournalEntry)) or 0),
        transfer_counts={str(k): int(v) for k, v in counts.items()},
    )


def journal(db: Session, *, account_id: str | None, tx: str | None, before: str | None, limit: int) -> schemas.JournalPageOut:
    """Newest first. `before` is an opaque cursor: '<iso created_at>|<journal id>'."""
    query = select(JournalEntry).order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
    if tx:
        query = query.where(JournalEntry.transfer_tx == tx)
    if account_id:
        query = query.where(JournalEntry.id.in_(select(LedgerLine.journal_id).where(LedgerLine.account_id == account_id)))
    if before:
        at, _, jid = before.partition("|")
        cursor_at = datetime.fromisoformat(at)
        query = query.where((JournalEntry.created_at < cursor_at) | ((JournalEntry.created_at == cursor_at) & (JournalEntry.id < jid)))
    entries = list(db.scalars(query.limit(limit + 1)))
    has_more = len(entries) > limit
    entries = entries[:limit]

    names = dict(db.execute(select(Account.id, Account.name)).all())
    lines_by_journal: dict[str, list[schemas.LedgerLineOut]] = {e.id: [] for e in entries}
    if entries:
        for line in db.scalars(
            select(LedgerLine).where(LedgerLine.journal_id.in_(lines_by_journal)).order_by(LedgerLine.direction.desc(), LedgerLine.id)
        ):
            lines_by_journal[line.journal_id].append(schemas.LedgerLineOut(
                account_id=line.account_id, account_name=names.get(line.account_id, line.account_id),
                direction=line.direction, amount_minor=line.amount_minor,
            ))
    last = entries[-1] if entries else None
    return schemas.JournalPageOut(
        entries=[
            schemas.JournalEntryOut(id=e.id, transfer_tx=e.transfer_tx, memo=e.memo, created_at=e.created_at, lines=lines_by_journal[e.id])
            for e in entries
        ],
        next_before=f"{last.created_at.isoformat()}|{last.id}" if has_more and last else None,
    )
