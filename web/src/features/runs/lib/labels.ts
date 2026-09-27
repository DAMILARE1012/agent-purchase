import type { IconName, Tone } from "@/components/ui";
import type { AgentRun, GateOutcome, RunStatus, StepKind } from "@/types/domain";

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
