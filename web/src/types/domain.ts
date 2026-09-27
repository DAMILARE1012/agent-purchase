// Mandate Gate domain types (system_design.md §3–5). Amounts are integer kobo,
// timestamps ISO 8601. The mock API (src/mocks) serves these shapes until the
// FastAPI endpoints exist; the real API must return the same JSON.

// ---- Mandates ---------------------------------------------------------------

export type MandateMode = "present" | "not_present";
export type MandateStatus = "active" | "used_up" | "expired" | "revoked";
export type SellerPolicy = "verified_only" | "verified_and_known" | "listed";
export type SpendPeriod = "week" | "month";

/** The limits a shopper signs. Unset optional fields mean "most restrictive". */
export interface MandateLimits {
  /** What to buy, in the shopper's words, e.g. "HP 107a toner". */
  item: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  quantity: number;
  maxTotalMinor: number;
  maxPerItemMinor: number | null;
  sellerPolicy: SellerPolicy;
  /** Seller IDs, used when sellerPolicy is "listed". */
  sellerIds: string[];
  deliverBy: string | null;
  expiresAt: string;
  maxUses: number;
  /** Standing mandates only: a cap per period. */
  periodCapMinor: number | null;
  period: SpendPeriod | null;
  /** Delivery details the agent may share with sellers. */
  shareDelivery: { name: boolean; phone: boolean; address: boolean };
}

export interface Mandate {
  id: string;
  status: MandateStatus;
  mode: MandateMode;
  /** The sentence the shopper typed. */
  request: string;
  limits: MandateLimits;
  uses: number;
  /** Everything paid under this mandate. */
  spentMinor: number;
  /** Standing mandates: paid in the current week or month, which the period cap applies to. */
  periodSpentMinor: number | null;
  /** SHA-256 of the canonical mandate JSON; the passkey signs this. */
  mandateHash: string;
  signedAt: string;
  revokedAt: string | null;
  createdAt: string;
  runIds: string[];
}

export interface MandateQuestion {
  field: keyof MandateLimits;
  question: string;
}

/** Qwen's draft of the limits, before the shopper reviews and signs. */
export interface MandateDraft {
  request: string;
  mode: MandateMode;
  limits: MandateLimits;
  /** Fields the model couldn't ground in the request, set to the strictest value. */
  defaulted: Array<keyof MandateLimits>;
  questions: MandateQuestion[];
  compiledBy: string;
}

export interface DraftMandateRequest {
  request: string;
  mode: MandateMode;
}

export interface CreateMandateRequest {
  draft: MandateDraft;
  limits: MandateLimits;
  /** WebAuthn assertion over mandateHash (mocked until M6). */
  assertion: string;
}

// ---- Sellers ----------------------------------------------------------------

export type SellerTier = "verified" | "known" | "new" | "suspended";
export type CatalogKind = "structured" | "images" | "mixed";

export interface SellerAccount {
  bankCode: string;
  bankName: string;
  accountNumberMasked: string;
  nameOnAccount: string;
  verifiedAt: string | null;
}

export interface Seller {
  id: string;
  displayName: string;
  legalName: string;
  tier: SellerTier;
  category: string;
  city: string;
  catalogKind: CatalogKind;
  accounts: SellerAccount[];
  joinedAt: string;
  /** Sandbox only: this seller runs scripted attacks in the test marketplace. */
  adversarial: boolean;
}

export interface CatalogItem {
  sku: string;
  sellerId: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  packSize: number;
  unitPriceMinor: number;
  inStock: boolean;
  /** Where the listing came from: a structured feed or a photo read by Qwen. */
  source: "structured" | "image";
}

// ---- Agent runs -------------------------------------------------------------

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "paying"
  | "paid"
  | "blocked"
  | "declined"
  | "gave_up"
  | "failed";

export type StepKind =
  | "search_catalog"
  | "get_product"
  | "read_catalog_image"
  | "request_cart"
  | "propose_cart"
  | "ask_shopper"
  | "give_up"
  | "gate"
  | "payment";

export interface RunStep {
  id: string;
  at: string;
  kind: StepKind;
  /** One line for the timeline, e.g. "Read a price-list photo from Ikeja Office Hub". */
  summary: string;
  sellerId: string | null;
  /** True when the step's result came from a seller (untrusted content). */
  untrusted: boolean;
  /** Prompt-injection screening score for seller content (0–1); a signal, not a control. */
  injectionScore: number | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costMicroUsd: number;
}

export interface CartLine {
  sku: string;
  name: string;
  brand: string | null;
  model: string | null;
  packSize: number;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Cart {
  id: string;
  sellerId: string;
  sellerName: string;
  lines: CartLine[];
  deliveryFeeMinor: number;
  totalMinor: number;
  deliveryBy: string;
  payee: SellerAccount;
  expiresAt: string;
  sellerSignatureValid: boolean;
}

export type GateRule =
  | "mandate_valid"
  | "cart_signed"
  | "seller_allowed"
  | "arithmetic"
  | "within_limits"
  | "item_matches"
  | "delivery_date"
  | "payee_verified"
  | "period_cap"
  | "soft_new_seller"
  | "soft_price_outlier"
  | "soft_tight_delivery";

export type CheckResult = "pass" | "fail" | "warn" | "skipped";

export interface GateCheck {
  rule: GateRule;
  label: string;
  result: CheckResult;
  detail: string;
}

export type GateOutcome = "allow" | "needs_approval" | "deny";

export interface GateDecision {
  outcome: GateOutcome;
  gateVersion: string;
  checks: GateCheck[];
  decidedAt: string;
}

export interface AgentRun {
  id: string;
  mandateId: string;
  shopperName: string;
  status: RunStatus;
  agentVersion: string;
  startedAt: string;
  endedAt: string | null;
  /** Position in the queue while status is "queued". */
  queuePosition: number | null;
  steps: RunStep[];
  cart: Cart | null;
  decision: GateDecision | null;
  purchaseId: string | null;
  totals: { steps: number; tokens: number; costMicroUsd: number; latencyMs: number };
  /** Short reason when the run ended without a purchase. */
  outcomeNote: string | null;
}

// ---- Purchases and receipts ---------------------------------------------------

export type PurchaseStatus = "pending" | "paid" | "refunded" | "disputed";

export interface PurchaseReceipt {
  id: string;
  token: string;
  issuedAt: string;
  mandateHash: string;
  cartHash: string;
  gateVersion: string;
  agentVersion: string;
  networkSessionId: string;
  signingKeyId: string;
}

export interface Purchase {
  id: string;
  runId: string;
  mandateId: string;
  shopperName: string;
  sellerId: string;
  sellerName: string;
  summary: string;
  totalMinor: number;
  status: PurchaseStatus;
  paidAt: string;
  payee: SellerAccount;
  receipt: PurchaseReceipt;
}

export interface ReceiptVerification {
  valid: boolean;
  purchase: Pick<Purchase, "id" | "sellerName" | "summary" | "totalMinor" | "status" | "paidAt"> | null;
  checks: Array<{ label: string; result: CheckResult; detail: string }>;
}

// ---- Seller workspace ---------------------------------------------------------

export interface SellerOrder {
  id: string;
  purchaseId: string;
  shopperName: string;
  summary: string;
  totalMinor: number;
  paidAt: string;
  deliverBy: string;
  status: "to_fulfil" | "delivered" | "refunded";
}

// ---- Support ------------------------------------------------------------------

export interface BlockedCart {
  runId: string;
  shopperName: string;
  sellerId: string;
  sellerName: string;
  totalMinor: number;
  failedRules: GateRule[];
  decidedAt: string;
  sellerAdversarial: boolean;
}

export interface Dispute {
  id: string;
  purchaseId: string;
  shopperName: string;
  sellerName: string;
  reason: string;
  status: "open" | "resolved";
  openedAt: string;
}

// ---- Ops: agent versions, evaluation, test marketplace --------------------------

export interface AgentVersion {
  id: string;
  status: "live" | "candidate" | "retired";
  model: string;
  fallbackModel: string;
  prompts: Array<{ task: string; version: string }>;
  params: { temperature: number; reasoningEffort: "none" | "low" | "medium" | "high" };
  createdAt: string;
  changelog: string;
}

export interface EvalMetric {
  name: string;
  value: number;
  unit: "%" | "ms" | "₦" | "$" | "steps";
  /** Lower is better for rates of bad things, latency and cost. */
  better: "higher" | "lower";
  threshold: number | null;
  pass: boolean;
}

export interface EvalResult {
  versionId: string;
  suite: "intent_fidelity" | "shopping_tasks" | "catalog_reading" | "gate_properties";
  cases: number;
  metrics: EvalMetric[];
  runAt: string;
}

export type AttackFamily =
  | "instruction_injection"
  | "misleading_terms"
  | "bait_and_switch"
  | "payee_substitution"
  | "lookalike_seller"
  | "mandate_broadening"
  | "tool_confusion"
  | "replay"
  | "resource_abuse"
  | "privacy_leak";

export interface RangeReport {
  versionId: string;
  model: string;
  generatedAt: string;
  families: Array<{ family: AttackFamily; label: string; runs: number; fooled: number; violations: number }>;
}

export interface OpsOverview {
  runsToday: number;
  purchasesToday: number;
  blockedToday: number;
  violations: number;
  p95RunSeconds: number;
  costPerPurchaseMicroUsd: number;
  queueDepth: number;
  fallbackRate: number;
  liveVersion: string;
}
