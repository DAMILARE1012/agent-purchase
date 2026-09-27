import type { IconName, Tone } from "@/components/ui";
import type { AgentRun, GateOutcome, GateRule, RunStatus, StepKind } from "@/types/domain";

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Shopping", tone: "ai" },
  awaiting_approval: { label: "Needs you", tone: "crypto" },
  paying: { label: "Paying", tone: "ai" },
  paid: { label: "Paid", tone: "truth" },
  blocked: { label: "Blocked", tone: "bad" },
  declined: { label: "Declined", tone: "neutral" },
  gave_up: { label: "No match", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
};

export const STEP_ICON: Record<StepKind, IconName> = {
  search_catalog: "search",
  get_product: "store",
  read_catalog_image: "receipt",
  request_cart: "cart",
  propose_cart: "bot",
  ask_shopper: "person",
  give_up: "close",
  gate: "shield",
  payment: "bank",
};

export const OUTCOME: Record<GateOutcome, { label: string; tone: Tone }> = {
  allow: { label: "Allowed", tone: "truth" },
  needs_approval: { label: "Allowed with warnings", tone: "ai" },
  deny: { label: "Refused", tone: "bad" },
};

export const isActiveRun = (r: Pick<AgentRun, "status">) => r.status === "queued" || r.status === "running" || r.status === "paying";

/** Short names for a failed rule, for tables and filters. */
export const RULE_FAILED: Record<GateRule, string> = {
  mandate_valid: "Mandate invalid",
  cart_signed: "Cart not signed",
  seller_allowed: "Seller not allowed",
  arithmetic: "Prices don't add up",
  within_limits: "Over the limit",
  item_matches: "Wrong item",
  delivery_date: "Arrives too late",
  payee_verified: "Wrong account",
  period_cap: "Over the spending cap",
  soft_new_seller: "New seller",
  soft_price_outlier: "Unusual price",
  soft_tight_delivery: "Tight delivery",
};
