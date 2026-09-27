// API contract between the web app and the FastAPI service (services/api/app/schemas.py).
// Mirrors system_design.md §10, using camelCase JSON.

export type Currency = "USD";

export type UserRole = "member" | "merchant" | "analyst" | "ops" | "guest";

export interface User {
  id: string;
  displayName: string;
  handle: string;
  role: UserRole;
  accountId: string | null;
}

export interface SessionInfo {
  user: User;
  authenticated: boolean;
}

/** One side of a payment. Someone at another bank has userId "ext:<bank>:<account>". */
export interface PartySummary {
  userId: string;
  displayName: string;
  handle: string;
  accountNumber?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
}

export type Rail = "internal" | "interbank";

export type TransferStatus =
  | "initiated"
  | "pending"
  | "settled"
  | "held"
  | "failed"
  | "reversed";

export type TransferKind = "payment" | "refund";

export interface Transfer {
  tx: string;
  kind: TransferKind;
  refundOf: string | null;
  amountMinor: number;
  currency: Currency;
  refundedMinor: number;
  status: TransferStatus;
  note: string | null;
  /** internal: both people on this platform. interbank: one side is at another bank, via the payment network. */
  rail: Rail;
  networkSessionId: string | null;
  networkStatus: string | null;
  payer: PartySummary;
  payee: PartySummary;
  /** Relative to the signed-in viewer. */
  direction: "in" | "out";
  createdAt: string;
  settledAt: string | null;
  reversedAt: string | null;
  confirmedAt: string | null;
}

export interface Wallet {
  accountId: string;
  accountNumber: string | null;
  bankCode: string;
  bankName: string;
  balanceMinor: number;
  currency: Currency;
  recent: Transfer[];
}

export interface RiskSummary {
  score: number;
  band: "low" | "medium" | "high";
  reasons: string[];
}

export interface TransferDetail {
  transfer: Transfer;
  refunds: Transfer[];
  risk: RiskSummary | null;
}

export interface CreateTransferRequest {
  bankCode?: string;
  accountNumber?: string;
  toUserId?: string;
  amountMinor: number;
  note?: string;
  idempotencyKey: string;
}

export interface CreateTransferResponse {
  transfer: Transfer;
  next: "done" | "step_up_required" | "held";
  risk: RiskSummary;
}

export interface Bank {
  code: string;
  name: string;
  isPlatform: boolean;
}

export interface NameEnquiryRequest {
  bankCode: string;
  accountNumber: string;
}

export interface NameEnquiry {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  onPlatform: boolean;
}

export interface ExternalAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface SimulateInboundRequest {
  fromBankCode: string;
  fromAccountNumber: string;
  amountMinor: number;
  narration?: string;
}

export interface StepUpRequest {
  tx: string;
  code: string;
}

export interface RefundRequest {
  tx: string;
  amountMinor: number;
  idempotencyKey: string;
}

export interface Receipt {
  tx: string;
  token: string;
  url: string;
  issuedAt: string;
  printed: {
    amountMinor: number;
    currency: Currency;
    payerMasked: string;
    payeeMasked: string;
    createdAt: string;
  };
}

// ---- Verification ----------------------------------------------------------

export type ScanSource = "link" | "upload" | "webcam" | "paste";

export interface ScanRequest {
  token: string | null;
  source: ScanSource;
  /**
   * Sandbox-only stand-in for receipt vision output (OCR + tamper model),
   * until the vision service exists (M5). Ignored outside sandbox mode.
   */
  mockVision?: { printedAmountMinor?: number; tamperScore?: number };
}

export type Verdict = "VERIFIED" | "PENDING" | "SUSPICIOUS";

export type ReasonCode =
  | "no_qr"
  | "bad_signature"
  | "unknown_transfer"
  | "payload_mismatch"
  | "reversed"
  | "already_confirmed"
  | "text_mismatch"
  | "edited_image"
  | "risk_flag";

export type WarningCode =
  | "previously_checked"
  | "old_receipt"
  | "visual_check_unavailable"
  | "not_your_payment";

export interface ScanWarning {
  code: WarningCode;
  message: string;
}

export type ViewLevel = "payee" | "payer" | "public";

export interface ScanChecks {
  signature: "pass" | "fail" | "skipped";
  status: TransferStatus | "unknown";
  payee: "match" | "payer" | "other" | "public" | "external" | "skipped";
  replay: "none" | "confirmed" | "checked_before" | "skipped";
  vision: {
    result: "match" | "mismatch" | "edited" | "unavailable" | "not_run";
    printedAmountMinor?: number;
    tamperScore?: number;
  };
}

export interface ScanResult {
  scanId: string;
  verdict: Verdict;
  reasons: ReasonCode[];
  warnings: ScanWarning[];
  view: ViewLevel;
  message: string;
  canConfirm: boolean;
  canRefund: boolean;
  checks: ScanChecks;
  transfer: {
    tx: string;
    amountMinor: number;
    currency: Currency;
    status: TransferStatus;
    createdAt: string;
    settledAt: string | null;
    confirmedAt: string | null;
    refundedMinor: number;
    payerName: string | null;
    payeeName: string | null;
    rail: Rail;
    payeeBankName: string | null;
    payeeAccountMasked: string | null;
  } | null;
}

// ---- Disputes and risk console --------------------------------------------

export interface OpenDisputeRequest {
  tx?: string;
  scanId?: string;
  reason: string;
}

export type CaseKind =
  | "held_transfer"
  | "suspicious_scan"
  | "dispute"
  | "reversal_shortfall";

export interface CaseSummary {
  id: string;
  kind: CaseKind;
  status: "open" | "resolved";
  title: string;
  openedAt: string;
  transferTx: string | null;
  amountMinor: number | null;
  riskScore: number | null;
}

export interface EvidenceItem {
  id: string;
  label: string;
  value: string;
}

export interface CopilotSentence {
  text: string;
  cites: string[];
}

export interface CopilotSummary {
  model: string;
  sentences: CopilotSentence[];
  suggestedOutcome: string;
  draftReply: string;
}

export type CaseDecision =
  | "release"
  | "cancel"
  | "resolve_for_payee"
  | "resolve_for_payer"
  | "close";

export interface CaseDetail extends CaseSummary {
  reasons: string[];
  evidence: EvidenceItem[];
  copilot: CopilotSummary;
  allowedDecisions: CaseDecision[];
  resolution: string | null;
}

// ---- Sandbox (development only) --------------------------------------------

export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  viewerUserId: string;
  /** Keycloak username to sign in as; "" means signed out. */
  viewerUsername: string;
  request: ScanRequest;
}

// ---- Platform ledger (ops) -------------------------------------------------

export interface LedgerAccount {
  id: string;
  kind: "user" | "system";
  name: string;
  ownerHandle: string | null;
  currency: Currency;
  debitsMinor: number;
  creditsMinor: number;
  balanceMinor: number;
}

export interface LedgerSummary {
  totalDebitsMinor: number;
  totalCreditsMinor: number;
  balanced: boolean;
  customerBalancesMinor: number;
  inSuspenseMinor: number;
  fundedMinor: number;
  reversedMinor: number;
  journalCount: number;
  transferCounts: Partial<Record<TransferStatus, number>>;
}

export interface LedgerLine {
  accountId: string;
  accountName: string;
  direction: "DR" | "CR";
  amountMinor: number;
}

export interface JournalEntry {
  id: string;
  transferTx: string | null;
  memo: string;
  createdAt: string;
  lines: LedgerLine[];
}

export interface JournalPage {
  entries: JournalEntry[];
  nextBefore: string | null;
}

export interface JournalQuery {
  account?: string;
  tx?: string;
  before?: string;
}

export interface ApiError {
  error: string;
  message: string;
}
