"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, EmptyState, ErrorState, Icon, Input, LoadingState, PageHeader, SegmentedControl, StatTile } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CaseKind, CaseSummary } from "@/types/api";
import { useListCasesQuery } from "../api";
import { CASE_KIND_LABEL } from "../lib/labels";
import { RiskMeter } from "./RiskMeter";

type StatusFilter = "open" | "resolved" | "all";
type Sort = "risk" | "newest";

const KIND_TONE: Record<CaseKind, "bad" | "ai" | "crypto" | "neutral"> = {
  held_transfer: "ai",
  suspicious_scan: "bad",
  dispute: "crypto",
  reversal_shortfall: "neutral",
};

/** The analyst's work queue. */
export function CaseQueue() {
  const router = useRouter();
  const { data, isLoading, error } = useListCasesQuery(undefined, { refetchOnFocus: true, pollingInterval: 30_000 });
  const cases = useMemo(() => data ?? [], [data]);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [kind, setKind] = useState<CaseKind | "all">("all");
  const [sort, setSort] = useState<Sort>("risk");
  const [query, setQuery] = useState("");

  const open = cases.filter((c) => c.status === "open");
  const kpis = {
    open: open.length,
    heldValue: open.filter((c) => c.kind === "held_transfer").reduce((s, c) => s + (c.amountMinor ?? 0), 0),
    heldCount: open.filter((c) => c.kind === "held_transfer").length,
    suspicious: open.filter((c) => c.kind === "suspicious_scan").length,
    disputes: open.filter((c) => c.kind === "dispute").length,
    resolved: cases.length - open.length,
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => kind === "all" || c.kind === kind)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.transferTx ?? "").toLowerCase().includes(q))
      .sort((a, b) => (sort === "risk" ? (b.riskScore ?? -1) - (a.riskScore ?? -1) : b.openedAt.localeCompare(a.openedAt)));
  }, [cases, status, kind, sort, query]);

  if (isLoading) return <LoadingState label="Loading cases…" />;
  if (error) return <ErrorState message={errorMessage(error)!} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Case queue" description="Held payments, suspicious receipts and disputes. The AI summarises the evidence; you make the decision." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open cases" value={kpis.open} detail={`${kpis.disputes} dispute${kpis.disputes === 1 ? "" : "s"} waiting`} icon={<Icon name="shield" />} />
        <StatTile label="Held payments" value={formatMoney(kpis.heldValue)} detail={`${kpis.heldCount} payment${kpis.heldCount === 1 ? "" : "s"} on hold`} icon={<Icon name="clock" />} />
        <StatTile label="Suspicious receipts" value={kpis.suspicious} detail="Forged or edited receipts shown to users" icon={<Icon name="alert" />} />
        <StatTile label="Resolved" value={kpis.resolved} detail="Decisions recorded as training labels" icon={<Icon name="check" />} />
      </div>

      <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <SegmentedControl
            label="Case status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Open", count: kpis.open },
              { value: "resolved", label: "Resolved", count: kpis.resolved },
              { value: "all", label: "All", count: cases.length },
            ]}
          />
          <label>
            <span className="sr-only">Case type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as CaseKind | "all")} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
              <option value="all">All types</option>
              {(Object.keys(CASE_KIND_LABEL) as CaseKind[]).map((k) => (
                <option key={k} value={k}>{CASE_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="relative">
            <span className="sr-only">Search cases</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <Input id="case-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or ID" className="h-8 w-52 pl-8 text-sm" />
          </label>
          <div className="ml-auto">
            <SegmentedControl label="Sort" value={sort} onChange={setSort} options={[{ value: "risk", label: "Highest risk" }, { value: "newest", label: "Newest" }]} />
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={status === "open" ? "No open cases" : "No cases match these filters"}>
              {status === "open" ? "New held payments and flagged receipts will appear here." : "Try a different filter."}
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs font-semibold text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-semibold">Case</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2.5 font-semibold">Risk</th>
                  <th className="px-3 py-2.5 font-semibold">Opened</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c: CaseSummary) => (
                  <tr key={c.id} onClick={() => router.push(`/risk/cases/${c.id}`)} className="cursor-pointer transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <a href={`/risk/cases/${c.id}`} onClick={(e) => e.preventDefault()} className="flex flex-col outline-none">
                        <span className="font-semibold">{c.title}</span>
                        <span className="font-mono text-xs text-muted">{c.id}</span>
                      </a>
                    </td>
                    <td className="px-3 py-3"><Badge tone={KIND_TONE[c.kind]}>{CASE_KIND_LABEL[c.kind]}</Badge></td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{c.amountMinor !== null ? formatMoney(c.amountMinor) : "—"}</td>
                    <td className="px-3 py-3"><RiskMeter score={c.riskScore} /></td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2" title={formatDateTime(c.openedAt)}>{formatRelative(c.openedAt)}</td>
                    <td className="px-5 py-3">
                      {c.status === "open" ? <Badge tone="ai">Open</Badge> : <Badge tone="truth">Resolved</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
