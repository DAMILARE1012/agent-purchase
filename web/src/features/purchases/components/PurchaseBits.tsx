import { Badge, type Tone } from "@/components/ui";
import type { PurchaseStatus } from "@/types/domain";

const STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  pending: { label: "Paying", tone: "ai" },
  paid: { label: "Paid", tone: "truth" },
  refunded: { label: "Refunded", tone: "neutral" },
  disputed: { label: "Disputed", tone: "ai" },
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
