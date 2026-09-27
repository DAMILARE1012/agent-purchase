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
    currency: Mapped[str] = mapped_column(String(3), default="NGN")
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


class Merchant(Base):
    """A seller in the platform's directory (system_design.md §5). Its public key verifies its carts."""

    __tablename__ = "merchants"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120))
    legal_name: Mapped[str] = mapped_column(String(160))
    tier: Mapped[str] = mapped_column(String(12))  # verified | known | new | suspended
    category: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80))
    catalog_kind: Mapped[str] = mapped_column(String(12))  # structured | images | mixed
    public_key: Mapped[str] = mapped_column(String(64))  # Ed25519, raw 32 bytes, base64url
    key_id: Mapped[str] = mapped_column(String(100))
    owner_username: Mapped[str | None] = mapped_column(String(100), index=True)
    # Sandbox only: a test-marketplace attacker. Never used by the gate.
    adversarial: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now_col()


class MerchantAccount(Base):
    """A settlement account a seller registered. Payments may only go to verified ones."""

    __tablename__ = "merchant_accounts"
    __table_args__ = (Index("uq_merchant_accounts_bank_number", "bank_code", "account_number", unique=True),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), index=True)
    bank_code: Mapped[str] = mapped_column(String(10))
    bank_name: Mapped[str] = mapped_column(String(80))
    account_number: Mapped[str] = mapped_column(String(10))
    # From the bank's name enquiry, never from the seller.
    name_on_account: Mapped[str | None] = mapped_column(String(160))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now_col()


class Mandate(Base):
    """A shopper's signed limits (system_design.md §3 step 1). The gate reads only this and the cart."""

    __tablename__ = "mandates"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(12))  # active | used_up | expired | revoked
    mode: Mapped[str] = mapped_column(String(12))  # present | not_present
    request: Mapped[str] = mapped_column(Text)
    limits: Mapped[dict] = mapped_column(JSON)
    # SHA-256 of the canonical {mode, limits}; the passkey signs this (verified from M6).
    mandate_hash: Mapped[str] = mapped_column(String(64))
    # The signature, as JSON: a WebAuthn assertion over the mandate's challenge, or a labelled sandbox test signature.
    assertion: Mapped[str] = mapped_column(Text)
    signature_kind: Mapped[str] = mapped_column(String(12), default="test")  # passkey | test
    passkey_id: Mapped[int | None] = mapped_column(ForeignKey("passkeys.id"))
    compiled_by: Mapped[str | None] = mapped_column(String(120))
    uses: Mapped[int] = mapped_column(BigInteger, default=0)
    spent_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now_col()


class AgentRelease(Base):
    """Prompt versions, models and settings released together (system_design.md §5). Mirrors app/agent/releases.py."""

    __tablename__ = "agent_releases"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    status: Mapped[str] = mapped_column(String(12))  # live | candidate | retired
    model: Mapped[str] = mapped_column(String(80))
    fallback_model: Mapped[str] = mapped_column(String(80))
    prompts: Mapped[dict] = mapped_column(JSON)
    params: Mapped[dict] = mapped_column(JSON)
    changelog: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgentRun(Base):
    """One AI shopping run under a mandate: queued, then worked by a worker, ending with a cart or not."""

    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    mandate_id: Mapped[str] = mapped_column(ForeignKey("mandates.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    release_id: Mapped[str] = mapped_column(ForeignKey("agent_releases.id"))
    status: Mapped[str] = mapped_column(String(20), index=True)
    priority: Mapped[str] = mapped_column(String(12))  # interactive | background
    began_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signed_cart: Mapped[dict | None] = mapped_column(JSON)
    cart_id: Mapped[str | None] = mapped_column(String(80), index=True)
    cart_view: Mapped[dict | None] = mapped_column(JSON)
    decision: Mapped[dict | None] = mapped_column(JSON)
    outcome_note: Mapped[str | None] = mapped_column(Text)
    purchase_id: Mapped[str | None] = mapped_column(String(40))
    tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    cost_micro_usd: Mapped[int] = mapped_column(BigInteger, default=0)
    latency_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now_col()


class RunStep(Base):
    """One step of a run's trace: a model call, a tool call, the gate."""

    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(24))
    summary: Mapped[str] = mapped_column(Text)
    seller_id: Mapped[str | None] = mapped_column(String(60))
    untrusted: Mapped[bool] = mapped_column(Boolean, default=False)
    injection_score: Mapped[float | None] = mapped_column(Float)
    model: Mapped[str | None] = mapped_column(String(80))
    tokens_in: Mapped[int] = mapped_column(BigInteger, default=0)
    tokens_out: Mapped[int] = mapped_column(BigInteger, default=0)
    latency_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    cost_micro_usd: Mapped[int] = mapped_column(BigInteger, default=0)
    detail: Mapped[dict | None] = mapped_column(JSON)
    at: Mapped[datetime] = _now_col()


class InferenceLog(Base):
    """Every model call through the gateway (system_design.md §5, LLM gateway)."""

    __tablename__ = "inference_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str | None] = mapped_column(String(40), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64))
    task: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(80))
    prompt_version: Mapped[str] = mapped_column(String(20))
    input_hash: Mapped[str] = mapped_column(String(64))
    output: Mapped[dict | None] = mapped_column(JSON)
    tokens_in: Mapped[int] = mapped_column(BigInteger, default=0)
    tokens_out: Mapped[int] = mapped_column(BigInteger, default=0)
    latency_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    queue_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    cost_micro_usd: Mapped[int] = mapped_column(BigInteger, default=0)
    outcome: Mapped[str] = mapped_column(String(20))  # ok | cached | fallback | schema_error | error | budget
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Passkey(Base):
    """A shopper's WebAuthn credential, registered with the platform to sign mandates and approve payments."""

    __tablename__ = "passkeys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    credential_id: Mapped[str] = mapped_column(String(400), unique=True)  # base64url
    public_key: Mapped[str] = mapped_column(Text)  # COSE key, base64url
    sign_count: Mapped[int] = mapped_column(BigInteger, default=0)
    name: Mapped[str] = mapped_column(String(80))
    transports: Mapped[list | None] = mapped_column(JSON)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now_col()


class Purchase(Base):
    """
    A cart the shopper approved and the gate allowed at the moment of payment (M7).
    Unique per run, per cart and per transfer: a cart is paid at most once.
    """

    __tablename__ = "purchases"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), unique=True)
    cart_id: Mapped[str] = mapped_column(String(80), unique=True)
    mandate_id: Mapped[str] = mapped_column(ForeignKey("mandates.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), index=True)
    transfer_tx: Mapped[str] = mapped_column(ForeignKey("transfers.tx"), unique=True)
    total_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    summary: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(12))  # paying | paid | failed | reversed | refunded
    payee_bank_code: Mapped[str] = mapped_column(String(10))
    payee_account_number: Mapped[str] = mapped_column(String(10))
    payee_name: Mapped[str] = mapped_column(String(160))
    mandate_hash: Mapped[str] = mapped_column(String(64))
    # SHA-256 of the seller-signed cart's canonical JSON: exactly what the seller signed and the shopper approved.
    cart_hash: Mapped[str] = mapped_column(String(64))
    gate_version: Mapped[str] = mapped_column(String(40))
    agent_version: Mapped[str] = mapped_column(String(60))
    # The gate's decision at the moment of payment (not the one from when the AI proposed the cart).
    decision: Mapped[dict] = mapped_column(JSON)
    approval_kind: Mapped[str] = mapped_column(String(12))  # passkey | test
    approval: Mapped[str] = mapped_column(Text)  # The WebAuthn assertion over the cart's challenge, as JSON.
    passkey_id: Mapped[int | None] = mapped_column(ForeignKey("passkeys.id"))
    receipt_token: Mapped[str] = mapped_column(Text)
    receipt_kid: Mapped[str] = mapped_column(ForeignKey("signing_keys.kid"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
