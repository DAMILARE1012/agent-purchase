"""Database schema (system_design.md §9)."""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now_col() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    """A person known to the platform. `id` is the Keycloak subject (sub)."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))  # shopper | seller | analyst | ops | admin
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _now_col()


class Account(Base):
    """A ledger account: one per wallet user, plus the platform's system accounts."""

    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), unique=True)
    # What people give out to get paid: 10 digits with a check digit. System accounts have none.
    account_number: Mapped[str | None] = mapped_column(String(10), unique=True)
    kind: Mapped[str] = mapped_column(String(10))  # user | system
    name: Mapped[str] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    status: Mapped[str] = mapped_column(String(10), default="active")
    created_at: Mapped[datetime] = _now_col()


class Transfer(Base):
    __tablename__ = "transfers"

    tx: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # payment | refund
    refund_of: Mapped[str | None] = mapped_column(ForeignKey("transfers.tx"))
    payer_account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    payee_account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    refunded_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(12))
    note: Mapped[str | None] = mapped_column(String(200))
    # internal: both parties on the platform. interbank: one party is at another bank, reached via the switch,
    # and the platform side of the entry is the network settlement account.
    rail: Mapped[str] = mapped_column(String(10), default="internal", server_default="internal")
    counterparty_bank_code: Mapped[str | None] = mapped_column(String(10))
    counterparty_bank_name: Mapped[str | None] = mapped_column(String(80))
    counterparty_account_number: Mapped[str | None] = mapped_column(String(10))
    counterparty_name: Mapped[str | None] = mapped_column(String(120))
    network_session_id: Mapped[str | None] = mapped_column(String(40), unique=True)
    network_status: Mapped[str | None] = mapped_column(String(12))
    risk_score: Mapped[float] = mapped_column(Float)
    risk_band: Mapped[str] = mapped_column(String(8))
    risk_reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    scope_key: Mapped[str] = mapped_column(String(200), primary_key=True)
    tx: Mapped[str] = mapped_column(ForeignKey("transfers.tx"))
    created_at: Mapped[datetime] = _now_col()


class JournalEntry(Base):
    """One balanced posting. Its lines are LedgerLine rows; debits equal credits."""

    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    transfer_tx: Mapped[str | None] = mapped_column(ForeignKey("transfers.tx"), index=True)
    memo: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class LedgerLine(Base):
    """Append-only. A user account's balance is its credits minus its debits."""

    __tablename__ = "ledger_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    journal_id: Mapped[str] = mapped_column(ForeignKey("journal_entries.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    direction: Mapped[str] = mapped_column(String(2))  # DR | CR
    amount_minor: Mapped[int] = mapped_column(BigInteger)

    __table_args__ = (Index("ix_ledger_lines_account", "account_id"),)


class SigningKey(Base):
    """Receipt signing keys. Development stores the private key here; production uses a KMS."""

    __tablename__ = "signing_keys"

    kid: Mapped[str] = mapped_column(String(40), primary_key=True)
    public_key_pem: Mapped[str] = mapped_column(Text)
    private_key_pem: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10))  # active | retired | revoked
    created_at: Mapped[datetime] = _now_col()


class Receipt(Base):
    __tablename__ = "receipts"

    tx: Mapped[str] = mapped_column(ForeignKey("transfers.tx"), primary_key=True)
    token: Mapped[str] = mapped_column(Text)
    kid: Mapped[str] = mapped_column(ForeignKey("signing_keys.kid"))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    viewer_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    tx: Mapped[str | None] = mapped_column(String(40), index=True)
    source: Mapped[str] = mapped_column(String(10))
    verdict: Mapped[str] = mapped_column(String(12))
    reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Confirmation(Base):
    __tablename__ = "confirmations"

    tx: Mapped[str] = mapped_column(ForeignKey("transfers.tx"), primary_key=True)
    confirmed_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10))  # open | resolved
    title: Mapped[str] = mapped_column(String(200))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    transfer_tx: Mapped[str | None] = mapped_column(ForeignKey("transfers.tx"))
    scan_id: Mapped[str | None] = mapped_column(ForeignKey("scans.id"))
    risk_score: Mapped[float | None] = mapped_column(Float)
    reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    resolution: Mapped[str | None] = mapped_column(String(300))
    dedupe_key: Mapped[str | None] = mapped_column(String(200), index=True)


class Label(Base):
    """Outcome labels from analyst decisions, fed back to model training (§11.2)."""

    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(20))
    labeled_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _now_col()
