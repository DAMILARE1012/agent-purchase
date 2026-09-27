import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Mandate, MandateLimits } from "@/types/domain";
import { limitRows } from "../lib/limits";

interface LimitsTableProps {
  limits: MandateLimits;
  mode: Mandate["mode"];
  /** Fields set to the strictest value because the request didn't say. */
  defaulted?: Array<keyof MandateLimits>;
  compact?: boolean;
}

/** The mandate's exact values, as the shopper approves them. */
export function LimitsTable({ limits, mode, defaulted = [], compact }: LimitsTableProps) {
  return (
    <dl className={cn("divide-y divide-line", compact ? "text-sm" : "")}>
      {limitRows(limits, mode).map((row) => (
        <div key={row.label} className={cn("grid grid-cols-[minmax(7rem,40%)_1fr] gap-3", compact ? "py-2" : "py-2.5")}>
          <dt className="text-muted">{row.label}</dt>
          <dd className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            <span className={row.field === "maxTotalMinor" ? "tabular-nums" : undefined}>{row.value}</span>
            {defaulted.includes(row.field) && <Badge tone="ai">Strictest default</Badge>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
