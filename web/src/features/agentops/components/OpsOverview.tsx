"use client";

import Link from "next/link";
import { Badge, Card, ErrorState, Icon, LoadingState, PageHeader, StatTile } from "@/components/ui";
import { RULE_FAILED, RUN_STATUS } from "@/features/runs";
import { useGetBlockedCartsQuery } from "@/features/support";
import { errorMessage } from "@/lib/api-error";
import type { GateRule, RunStatus } from "@/types/domain";
import { useGetAgentVersionsQuery, useGetAllRunsQuery, useGetOpsOverviewQuery } from "../api";
import { formatUsd } from "../lib/format";
import { BarList } from "./BarList";

/** The AI shopper right now: volume, safety, speed, cost. */
export function OpsOverview() {
  const { data: o, error, isLoading } = useGetOpsOverviewQuery(undefined, { pollingInterval: 10_000 });
  const { data: runs } = useGetAllRunsQuery();
  const { data: blocked } = useGetBlockedCartsQuery();
  const { data: versions } = useGetAgentVersionsQuery();

  if (isLoading) return <LoadingState />;
  if (error || !o) return <ErrorState message={errorMessage(error) ?? ""} />;

  const byRule = new Map<GateRule, number>();
  for (const b of blocked ?? []) for (const r of b.failedRules) byRule.set(r, (byRule.get(r) ?? 0) + 1);
  const byStatus = new Map<RunStatus, number>();
  for (const r of runs ?? []) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const live = versions?.find((v) => v.status === "live");
  const candidate = versions?.find((v) => v.status === "candidate");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="How the AI shopper is doing. The number that must always be zero is money paid outside a mandate." />

      <Card className="flex flex-wrap items-center gap-4 border-truth bg-truth-bg">
        <span className="grid size-12 place-items-center rounded-full bg-surface text-truth"><Icon name="shield" className="size-6" /></span>
        <div className="flex flex-1 flex-col">
          <span className="font-mono text-xs font-semibold tracking-widest text-truth uppercase">Money out wrongly</span>
          <span className="font-display text-3xl font-bold">{o.violations}</span>
        </div>
        <p className="max-w-md text-sm text-ink-2">Payments that broke a mandate, across live traffic. Any non-zero value is a severity-1 incident.</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Runs in 24 h" value={o.runsToday} detail={o.purchasesToday === 1 ? "1 purchase" : `${o.purchasesToday} purchases`} />
        <StatTile label="Carts refused in 24 h" value={o.blockedToday} detail="By the gate, before payment" />
        <StatTile label="p95 run time" value={`${o.p95RunSeconds.toFixed(0)} s`} detail="Target: under 30 s to a proposed cart" />
        <StatTile label="Model cost per purchase" value={formatUsd(o.costPerPurchaseMicroUsd)} detail={`Fallback rate ${(o.fallbackRate * 100).toFixed(1)}% · queue ${o.queueDepth}`} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Why carts were refused</h2>
            <Link href="/ops/traces" className="text-sm font-semibold text-crypto hover:underline">Traces</Link>
          </div>
          <BarList
            label="Refused carts by failed rule"
            rows={[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([rule, n]) => ({ key: rule, label: RULE_FAILED[rule], value: n }))}
          />
          <p className="text-xs text-muted">A cart can fail several rules, so these add up to more than the number of refused carts.</p>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">Runs by outcome</h2>
          <BarList
            label="Runs by outcome"
            rows={[...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ key: s, label: RUN_STATUS[s].label, value: n }))}
          />
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">Live agent version</span>
          <span className="font-mono text-lg font-semibold">{o.liveVersion}</span>
          {live && <span className="text-sm text-ink-2">{live.model} · fallback {live.fallbackModel}</span>}
        </div>
        {candidate && (
          <div className="flex items-center gap-3">
            <Badge tone="ai">Candidate: {candidate.id}</Badge>
            <Link href={`/ops/evals?a=${o.liveVersion}&b=${candidate.id}`} className="text-sm font-semibold text-crypto hover:underline">Compare</Link>
          </div>
        )}
      </Card>
    </div>
  );
}
