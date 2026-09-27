// Contract between the web app and the FastAPI service (services/api/app/schemas.py)
// for the parts that already exist: session, banks, funding balance and the platform
// ledger. The Mandate Gate domain (mandates, runs, carts, purchases…) is in ./domain.ts.

export type Currency = "NGN" | "USD";

export type UserRole = "shopper" | "seller" | "analyst" | "ops" | "admin" | "guest";

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

// ---- Funding balance (the existing wallet) ---------------------------------

export interface PartySummary {
  userId: string;
  displayName: string;
  handle: string;
  accountNumber?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
}

export type Rail = "internal" | "interbank";

export type TransferStatus = "initiated" | "pending" | "settled" | "held" | "failed" | "reversed";

export interface Transfer {
  tx: string;
  kind: "payment" | "refund";
  refundOf: string | null;
  amountMinor: number;
  currency: Currency;
  refundedMinor: number;
  status: TransferStatus;
  note: string | null;
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

// ---- Banks and name enquiry ------------------------------------------------

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
