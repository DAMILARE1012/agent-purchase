"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader, SegmentedControl } from "@/components/ui";
import { useGetMandatesQuery } from "@/features/mandates";
import { errorMessage } from "@/lib/api-error";
import { useNow } from "@/lib/useNow";
import type { AgentRun } from "@/types/domain";
import { useGetRunsQuery } from "../api";
import { isActiveRun } from "../lib/labels";
import { RunRow } from "./RunBits";

type Filter = "all" | "needs_you" | "blocked" | "paid";

const MATCH: Record<Filter, (r: AgentRun) => boolean> = {
  all: () => true,
  needs_you: (r) => r.status === "awaiting_approval" || isActiveRun(r),
  blocked: (r) => r.status === "blocked",
  paid: (r) => r.status === "paid",
};

export function RunsList() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, isLoading } = useGetRunsQuery(undefined, { pollingInterval: 3_000, skipPollingIfUnfocused: true });
  const { data: mandates } = useGetMandatesQuery();
  const now = useNow();
  const item = (r: AgentRun) => mandates?.find((m) => m.id === r.mandateId)?.limits.item;
  const runs = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI shopping" description="Every time the AI shopped for you: what it found, what the gate decided, and what was paid." />
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
            options={(["all", "needs_you", "blocked", "paid"] as Filter[]).map((f) => ({
              value: f,
              label: { all: "All", needs_you: "Needs you", blocked: "Blocked", paid: "Paid" }[f],
              count: runs.filter(MATCH[f]).length,
            }))}
          />
          {runs.filter(MATCH[filter]).length === 0 ? (
            <EmptyState title="Nothing here">Start shopping from one of your mandates.</EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {runs.filter(MATCH[filter]).map((r) => {
                const what = item(r);
                return <RunRow key={r.id} run={r} now={now} title={what ? `${what}${r.cart ? ` · ${r.cart.sellerName}` : ""}` : undefined} />;
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
