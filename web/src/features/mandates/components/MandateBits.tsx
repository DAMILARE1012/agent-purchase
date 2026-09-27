import { Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { Mandate, MandateStatus } from "@/types/domain";
import { spendLimit, STATUS } from "../lib/limits";

export function MandateStatusBadge({ status }: { status: MandateStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ModeBadge({ mode }: { mode: Mandate["mode"] }) {
  return mode === "not_present" ? <Badge tone="crypto">While you&apos;re away</Badge> : <Badge>You approve each cart</Badge>;
}

/** Spending against the mandate's limit, as a thin bar with the numbers beside it. */
export function SpendMeter({ mandate }: { mandate: Mandate }) {
  const { spentMinor: spent, limitMinor, label } = spendLimit(mandate);
  const standing = mandate.limits.period !== null;
  const pct = limitMinor > 0 ? Math.min(100, (spent / limitMinor) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">Spent</span>
        <span className="tabular-nums">
          <span className="font-semibold text-ink">{formatMoney(spent)}</span>
          <span className="text-muted"> of {formatMoney(limitMinor)} {label}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Spent against the limit"
        aria-valuemin={0}
        aria-valuemax={limitMinor}
        aria-valuenow={spent}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-truth" style={{ width: `${pct}%` }} />
      </div>
      {standing && mandate.spentMinor > spent && <span className="text-xs text-muted">{formatMoney(mandate.spentMinor)} in total since it was signed</span>}
    </div>
  );
}
