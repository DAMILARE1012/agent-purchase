import { Badge, type Tone } from "@/components/ui";
import type { Purchase, PurchaseStatus } from "@/types/domain";

const STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  pending: { label: "Paying", tone: "ai" },
  paid: { label: "Paid", tone: "truth" },
  failed: { label: "Transfer failed", tone: "bad" },
  reversed: { label: "Reversed", tone: "bad" },
  refunded: { label: "Refunded", tone: "neutral" },
  disputed: { label: "Disputed", tone: "ai" },
};

/** Money that left the shopper's balance and stayed out: failed, reversed and refunded payments came back. */
export const isSpent = (p: Pick<Purchase, "status">) => p.status === "paid" || p.status === "pending" || p.status === "disputed";

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
