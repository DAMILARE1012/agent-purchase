import Link from "next/link";
import { Badge, Money } from "@/components/ui";
import { formatRelative } from "@/lib/dates";
import type { AgentRun, RunStatus } from "@/types/domain";
import { RUN_STATUS } from "../lib/labels";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, tone } = RUN_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** One run in a list: who it tried to buy from, how much, and how it ended. */
export function RunRow({ run, now, title }: { run: AgentRun; now: number; title?: string }) {
  const seller = run.cart?.sellerName;
  return (
    <li>
      <Link href={`/shop/runs/${run.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2/60">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{title ?? (seller ? `Cart from ${seller}` : "No cart proposed")}</span>
          <span className="truncate text-sm text-muted">
            {run.outcomeNote ?? (run.status === "awaiting_approval" ? "Waiting for your approval" : `${run.steps.length} steps`)} · {formatRelative(run.startedAt, now)}
          </span>
        </div>
        {run.cart && <Money amountMinor={run.cart.totalMinor} className="hidden font-semibold sm:block" />}
        <RunStatusBadge status={run.status} />
      </Link>
    </li>
  );
}
