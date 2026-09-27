"""API contract. Serialised as camelCase to match web/src/types/api.ts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


Role = Literal["shopper", "seller", "analyst", "ops", "admin", "guest"]
TransferStatus = Literal["initiated", "pending", "settled", "held", "failed", "reversed"]
Verdict = Literal["VERIFIED", "PENDING", "SUSPICIOUS"]
ScanSource = Literal["link", "upload", "webcam", "paste"]


class UserOut(Schema):
    id: str
    display_name: str
    handle: str
    role: Role
    account_id: str | None


class SessionOut(Schema):
    user: UserOut
    authenticated: bool


class PartySummary(Schema):
    """One side of a payment. For someone at another bank, user_id is "ext:<bank>:<account>"."""

    user_id: str
    display_name: str
    handle: str
    account_number: str | None = None
    bank_code: str | None = None
    bank_name: str | None = None


class TransferOut(Schema):
    tx: str
    kind: Literal["payment", "refund"]
    refund_of: str | None
    amount_minor: int
    currency: str
    refunded_minor: int
    status: TransferStatus
    note: str | None
    rail: Literal["internal", "interbank"] = "internal"
    network_session_id: str | None = None
    network_status: str | None = None
    payer: PartySummary
    payee: PartySummary
    direction: Literal["in", "out"]
    created_at: datetime
    settled_at: datetime | None
    reversed_at: datetime | None
    confirmed_at: datetime | None


class WalletOut(Schema):
    account_id: str
    account_number: str | None
    bank_code: str
    bank_name: str
    balance_minor: int
    currency: str
    recent: list[TransferOut]


class RiskSummary(Schema):
    score: float
    band: Literal["low", "medium", "high"]
    reasons: list[str]


class TransferDetailOut(Schema):
    transfer: TransferOut
    refunds: list[TransferOut]
    risk: RiskSummary | None


class CreateTransferIn(Schema):
    """Pay by bank + account number (any bank), or by platform user ID."""

    bank_code: str | None = None
    account_number: str | None = None
    to_user_id: str | None = None
    amount_minor: int
    note: str | None = None


class BankOut(Schema):
    code: str
    name: str
    is_platform: bool


class NameEnquiryIn(Schema):
    bank_code: str
    account_number: str


class NameEnquiryOut(Schema):
    bank_code: str
    bank_name: str
    account_number: str
    account_name: str
    on_platform: bool


class ExternalAccountOut(Schema):
    bank_code: str
    bank_name: str
    account_number: str
    account_name: str


class SimulateInboundIn(Schema):
    from_bank_code: str
    from_account_number: str
    amount_minor: int
    narration: str | None = None


class CreateTransferOut(Schema):
    transfer: TransferOut
    next: Literal["done", "step_up_required", "held"]
    risk: RiskSummary


class StepUpIn(Schema):
    code: str


class RefundIn(Schema):
    amount_minor: int


class PrintedReceipt(Schema):
    amount_minor: int
    currency: str
    payer_masked: str
    payee_masked: str
    created_at: datetime


class ReceiptOut(Schema):
    tx: str
    token: str
    url: str
    issued_at: datetime
    printed: PrintedReceipt


# ---- Verification -------------------------------------------------------------


class MockVision(Schema):
    """Sandbox stand-in for receipt vision output (OCR + tamper model)."""

    printed_amount_minor: int | None = None
    tamper_score: float | None = None


class ScanIn(Schema):
    token: str | None
    source: ScanSource
    mock_vision: MockVision | None = None


class ScanWarning(Schema):
    code: Literal["previously_checked", "old_receipt", "visual_check_unavailable", "not_your_payment"]
    message: str


class VisionCheck(Schema):
    result: Literal["match", "mismatch", "edited", "unavailable", "not_run"]
    printed_amount_minor: int | None = None
    tamper_score: float | None = None


class ScanChecks(Schema):
    signature: Literal["pass", "fail", "skipped"] = "skipped"
    status: str = "unknown"
    payee: Literal["match", "payer", "other", "public", "external", "skipped"] = "skipped"
    replay: Literal["none", "confirmed", "checked_before", "skipped"] = "skipped"
    vision: VisionCheck = VisionCheck(result="not_run")


class ScanTransfer(Schema):
    tx: str
    amount_minor: int
    currency: str
    status: TransferStatus
    created_at: datetime
    settled_at: datetime | None
    confirmed_at: datetime | None
    refunded_minor: int
    payer_name: str | None
    payee_name: str | None
    rail: Literal["internal", "interbank"] = "internal"
    payee_bank_name: str | None = None
    payee_account_masked: str | None = None


class ScanResultOut(Schema):
    scan_id: str
    verdict: Verdict
    reasons: list[str]
    warnings: list[ScanWarning]
    view: Literal["payee", "payer", "public"]
    message: str
    can_confirm: bool
    can_refund: bool
    checks: ScanChecks
    transfer: ScanTransfer | None


# ---- Disputes and risk console ---------------------------------------------------


class DisputeIn(Schema):
    tx: str | None = None
    scan_id: str | None = None
    reason: str


class CaseSummaryOut(Schema):
    id: str
    kind: str
    status: Literal["open", "resolved"]
    title: str
    opened_at: datetime
    transfer_tx: str | None
    amount_minor: int | None
    risk_score: float | None


class EvidenceItem(Schema):
    id: str
    label: str
    value: str


class CopilotSentence(Schema):
    text: str
    cites: list[str]


class CopilotSummary(Schema):
    model: str
    sentences: list[CopilotSentence]
    suggested_outcome: str
    draft_reply: str


class CaseDetailOut(CaseSummaryOut):
    reasons: list[str]
    evidence: list[EvidenceItem]
    copilot: CopilotSummary
    allowed_decisions: list[str]
    resolution: str | None


class DecisionIn(Schema):
    decision: Literal["release", "cancel", "resolve_for_payee", "resolve_for_payer", "close"]


# ---- Platform ledger (ops) ---------------------------------------------------------


class LedgerAccountOut(Schema):
    id: str
    kind: Literal["user", "system"]
    name: str
    owner_handle: str | None
    currency: str
    debits_minor: int
    credits_minor: int
    balance_minor: int


class LedgerSummaryOut(Schema):
    total_debits_minor: int
    total_credits_minor: int
    balanced: bool
    customer_balances_minor: int
    in_suspense_minor: int
    funded_minor: int
    reversed_minor: int
    journal_count: int
    transfer_counts: dict[str, int]


class LedgerLineOut(Schema):
    account_id: str
    account_name: str
    direction: Literal["DR", "CR"]
    amount_minor: int


class JournalEntryOut(Schema):
    id: str
    transfer_tx: str | None
    memo: str
    created_at: datetime
    lines: list[LedgerLineOut]


class JournalPageOut(Schema):
    entries: list[JournalEntryOut]
    next_before: str | None


# ---- Sandbox -----------------------------------------------------------------------


class DemoScenarioOut(Schema):
    id: str
    label: str
    description: str
    viewer_user_id: str
    viewer_username: str
    request: ScanIn
