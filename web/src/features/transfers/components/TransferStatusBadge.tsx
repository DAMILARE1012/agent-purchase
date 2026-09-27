import { Badge, type Tone } from "@/components/ui";
import type { TransferStatus } from "@/types/api";

const STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  initiated: { label: "Needs verification", tone: "ai" },
  pending: { label: "Pending", tone: "ai" },
  held: { label: "On hold", tone: "ai" },
  settled: { label: "Settled", tone: "neutral" },
  failed: { label: "Cancelled", tone: "bad" },
  reversed: { label: "Reversed", tone: "bad" },
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
