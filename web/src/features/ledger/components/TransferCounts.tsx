import { TransferStatusBadge } from "./TransferStatusBadge";
import type { LedgerSummary, TransferStatus } from "@/types/api";

const ORDER: TransferStatus[] = ["settled", "pending", "held", "initiated", "reversed", "failed"];

export function TransferCounts({ counts }: { counts: LedgerSummary["transferCounts"] }) {
  const present = ORDER.filter((s) => counts[s]);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="text-muted">Payments by status</span>
      {present.map((s) => (
        <span key={s} className="flex items-center gap-2">
          <TransferStatusBadge status={s} />
          <span className="font-mono font-semibold tabular-nums">{counts[s]}</span>
        </span>
      ))}
    </div>
  );
}
