"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState, LoadingState, PageHeader, SegmentedControl } from "@/components/ui";
import { RULE_FAILED, RunStatusBadge } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import type { AgentRun } from "@/types/domain";
import { useGetAllRunsQuery } from "../api";
import { formatUsd } from "../lib/format";

type Filter = "all" | "refused" | "flagged" | "paid";

const MATCH: Record<Filter, (r: AgentRun) => boolean> = {
  all: () => true,
  refused: (r) => r.decision?.outcome === "deny",
  flagged: (r) => r.steps.some((s) => (s.injectionScore ?? 0) >= 0.5),
  paid: (r) => r.status === "paid",
};

/** Every run across all shoppers, newest first. */
export function TracesList() {
  const { data, error, isLoading } = useGetAllRunsQuery(undefined, { pollingInterval: 5_000, skipPollingIfUnfocused: true });
  const [filter, setFilter] = useState<Filter>("all");
  const runs = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Run traces" description="Every agent run: model calls, seller inputs, the cart and the gate's decision." />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <SegmentedControl
            label="Show"
            value={filter}
            onChange={setFilter}
            options={(["all", "refused", "flagged", "paid"] as Filter[]).map((f) => ({
              value: f,
              label: { all: "All", refused: "Refused by gate", flagged: "Flagged seller input", paid: "Paid" }[f],
              count: runs.filter(MATCH[f]).length,
            }))}
          />
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Run</th>
                  <th className="px-4 py-2.5 font-semibold">Started</th>
                  <th className="px-4 py-2.5 font-semibold">Version</th>
                  <th className="px-4 py-2.5 font-semibold">Outcome</th>
                  <th className="px-4 py-2.5 font-semibold">Failed rules</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Steps</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.filter(MATCH[filter]).map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/ops/traces/${r.id}`} className="font-semibold hover:underline">
                        {r.shopperName}{r.cart ? ` → ${r.cart.sellerName}` : ""}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{r.id}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{formatDateTime(r.startedAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.agentVersion}</td>
                    <td className="px-4 py-2.5"><RunStatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 text-bad">{r.decision?.checks.filter((c) => c.result === "fail").map((c) => RULE_FAILED[c.rule]).join(", ")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.totals.steps}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.totals.tokens.toLocaleString("en-NG")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(r.totals.costMicroUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
