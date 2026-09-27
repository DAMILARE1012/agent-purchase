"""
Demo data (sandbox). User IDs match the users imported into Keycloak
(infra/keycloak/realm-scan-to-confirm.json), so signing in links to them.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.formatting import new_id, now
from app.models import Account, Case, Confirmation, JournalEntry, LedgerLine, Scan, Transfer, User
from app.services import ledger, signing
from app.services.account_numbers import make_account_number


@dataclass(frozen=True)
class DemoUser:
    id: str
    username: str
    display_name: str
    role: str
    funding_minor: int = 0  # kobo
    flagged: bool = False
    age_days: int = 300


DEMO_USERS = [
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000001", "sam", "Sam Carter", "shopper", 150_000_000),
    # Rita's balance is small on purpose: enough for groceries, not for a toner and a phone.
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000002", "rita", "Rita Alvarez", "shopper", 5_000_000),
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000003", "ada", "Ada's Provisions", "seller", 20_000_000),
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000004", "jordan", "Jordan Price", "shopper", 50_000_000, flagged=True, age_days=2),
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000005", "morgan", "Morgan Lee", "analyst"),
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000006", "olivia", "Olivia Grant", "ops"),
    DemoUser("0b4a8f0e-5c1a-4c1e-9a53-1d1f00000007", "kemi", "Kemi Adeyemi", "admin"),
]

LOW = (0.04, "low", [])
HELD_RISK = (
    0.91,
    "high",
    ["Account created 2 days ago", "First payment to this payee", "Amount is 6× the account's median payment", "Linked to a payment reversed today"],
)

OPENING_MEMO = "Sandbox opening balance (naira)"

TABLES = "purchases, labels, cases, confirmations, scans, receipts, idempotency_keys, ledger_lines, journal_entries, transfers, accounts, users"


def _hours_ago(hours: float):
    return now() - timedelta(hours=hours)


def _transfer(db: Session, payer: str, payee: str, amount_minor: int, status: str, hours: float, note: str, risk=LOW) -> Transfer:
    created = _hours_ago(hours)
    score, band, reasons = risk
    t = Transfer(
        tx=new_id("tx"), kind="payment", refund_of=None,
        payer_account_id=f"acct_{payer}", payee_account_id=f"acct_{payee}",
        amount_minor=amount_minor, currency=ledger.CURRENCY, refunded_minor=0, status=status, note=note,
        risk_score=score, risk_band=band, risk_reasons=reasons, created_at=created,
    )
    db.add(t)
    db.flush()
    signing.issue_receipt(db, t)
    settles = status in ("settled", "reversed")
    to_account = t.payee_account_id if settles else ledger.SUSPENSE
    memo = "Payment" if settles else ("Payment held for review" if status == "held" else "Payment pending settlement")
    ledger.post(db, memo, ledger.transfer_lines(t.payer_account_id, to_account, amount_minor), transfer_tx=t.tx, at=created)
    if settles:
        t.settled_at = created
    return t


def seed(db: Session) -> None:
    ledger.ensure_system_accounts(db)
    signing.active_key(db)

    for i, u in enumerate(DEMO_USERS, start=1):
        db.add(User(id=u.id, username=u.username, display_name=u.display_name, email=f"{u.username}@example.com",
                    role=u.role, flagged=u.flagged, created_at=now() - timedelta(days=u.age_days)))
        db.flush()
        if u.role in ("shopper", "seller"):
            db.add(Account(
                id=f"acct_{u.username}", user_id=u.id, account_number=make_account_number(f"2000000{i:02d}"),
                kind="user", name=u.display_name, currency=ledger.CURRENCY,
            ))
            db.flush()
            ledger.post(db, OPENING_MEMO, ledger.transfer_lines(ledger.FUNDING, f"acct_{u.username}", u.funding_minor),
                        at=now() - timedelta(days=30))

    rita = DEMO_USERS[1].id
    ada = DEMO_USERS[2].id

    _transfer(db, "sam", "rita", 2_500_000, "settled", 0.5, "Concert tickets")

    lunch = _transfer(db, "sam", "rita", 400_000, "settled", 24 * 14, "Lunch")
    db.add(Confirmation(tx=lunch.tx, confirmed_by=rita, confirmed_at=_hours_ago(24 * 14 - 0.2)))

    taxi = _transfer(db, "sam", "rita", 600_000, "settled", 24 * 5, "Taxi share")
    db.add(Scan(id=new_id("scn"), viewer_user_id=rita, tx=taxi.tx, source="link", verdict="VERIFIED", reasons=[], created_at=_hours_ago(24 * 5 - 0.1)))

    _transfer(db, "sam", "rita", 1_200_000, "pending", 0.2, "Rent share")

    phone = _transfer(db, "jordan", "rita", 3_000_000, "reversed", 3, "Phone")
    phone.reversed_at = _hours_ago(1)
    ledger.post(db, "Payment reversed", ledger.transfer_lines(phone.payee_account_id, ledger.REVERSALS, phone.amount_minor),
                transfer_tx=phone.tx, at=phone.reversed_at)

    cake = _transfer(db, "sam", "ada", 250_000, "settled", 2, "Cake order")
    _transfer(db, "jordan", "rita", 5_000_000, "settled", 1, "Sorry, sent too much!")

    held = _transfer(db, "jordan", "ada", 7_500_000, "held", 0.1, "Wedding cake deposit", HELD_RISK)
    db.add(Case(id=new_id("case"), kind="held_transfer", status="open", title="Held payment: Jordan Price → Ada's Bakery",
                opened_at=held.created_at, transfer_tx=held.tx, scan_id=None, risk_score=HELD_RISK[0], reasons=HELD_RISK[2],
                resolution=None, dedupe_key=f"held:{held.tx}"))

    edit_scan = Scan(id=new_id("scn"), viewer_user_id=ada, tx=cake.tx, source="upload", verdict="SUSPICIOUS",
                     reasons=["text_mismatch", "edited_image"], created_at=_hours_ago(1.5))
    db.add(edit_scan)
    db.flush()
    db.add(Case(id=new_id("case"), kind="suspicious_scan", status="open", title="Edited receipt shown to Ada's Bakery",
                opened_at=edit_scan.created_at, transfer_tx=cake.tx, scan_id=edit_scan.id, risk_score=0.88,
                reasons=["Printed amount ₦25,000.00 ≠ signed amount ₦2,500.00", "Tamper score 0.93 around the amount"],
                resolution=None, dedupe_key=f"scan:{cake.tx}:{ada}"))
    db.flush()


def top_up_in_naira(db: Session) -> int:
    """
    Installs seeded before M7 hold the previous product's dollar amounts, now read as naira
    (₦5,000 instead of $5,000). Gives each demo account its naira opening balance once.
    Returns how many accounts were topped up.
    """
    done = set(db.scalars(
        select(LedgerLine.account_id).join(JournalEntry, JournalEntry.id == LedgerLine.journal_id)
        .where(JournalEntry.memo == OPENING_MEMO, LedgerLine.direction == "CR")
    ))
    count = 0
    for u in DEMO_USERS:
        account_id = f"acct_{u.username}"
        if u.funding_minor and account_id not in done and db.get(Account, account_id) is not None:
            ledger.post(db, OPENING_MEMO, ledger.transfer_lines(ledger.FUNDING, account_id, u.funding_minor))
            count += 1
    return count


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(func.count()).select_from(User)):
        return False
    seed(db)
    db.commit()
    return True


def reset(db: Session) -> None:
    """Deletes all app data except signing keys and re-seeds. Keycloak users are untouched."""
    db.execute(text(f"TRUNCATE TABLE {TABLES} RESTART IDENTITY CASCADE"))
    seed(db)
