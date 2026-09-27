"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, Badge, ButtonLink, EmptyState, Icon, Input, SegmentedControl } from "@/components/ui";
import { TransferStatusBadge } from "@/features/transfers";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Transfer } from "@/types/api";

type Direction = "all" | "in" | "out";
type StatusFilter = "any" | "attention" | "settled" | "pending" | "reversed";

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: "all", label: "All" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "any", label: "Any status" },
  { value: "attention", label: "Needs confirming" },
  { value: "settled", label: "Settled" },
  { value: "pending", label: "Pending or on hold" },
  { value: "reversed", label: "Reversed or cancelled" },
];

function matchesStatus(t: Transfer, f: StatusFilter): boolean {
  switch (f) {
    case "any":
      return true;
    case "attention":
      return t.direction === "in" && t.kind === "payment" && t.status === "settled" && !t.confirmedAt;
    case "settled":
      return t.status === "settled";
    case "pending":
      return t.status === "pending" || t.status === "held" || t.status === "initiated";
    case "reversed":
      return t.status === "reversed" || t.status === "failed";
  }
}

interface ActivityTableProps {
  transfers: Transfer[];
  title?: string;
  /** Show only the first N rows and a "View all" link (dashboard mode: compact filters). */
  limit?: number;
}

export function ActivityTable({ transfers, title = "Recent activity", limit }: ActivityTableProps) {
  const compact = Boolean(limit);
  const router = useRouter();
  const [direction, setDirection] = useState<Direction>("all");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transfers.filter((t) => {
      if (direction !== "all" && t.direction !== direction) return false;
      if (!matchesStatus(t, status)) return false;
      if (!q) return true;
      const other = t.direction === "in" ? t.payer : t.payee;
      return [other.displayName, other.handle, t.note ?? "", t.tx].some((s) => s.toLowerCase().includes(q));
    });
  }, [transfers, direction, status, query]);

  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {compact && (
            <ButtonLink href="/activity" variant="ghost" size="sm">View all <Icon name="arrowRight" className="size-4" /></ButtonLink>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl label="Direction" value={direction} options={DIRECTIONS} onChange={setDirection} />
            <label className="relative min-w-40 flex-1 sm:max-w-72">
              <span className="sr-only">Search payments</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
              <Input
                id={`search-${title}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, note, ID"
                className="h-8 w-full pl-8 text-sm"
              />
            </label>
            {!compact && (
            <label>
              <span className="sr-only">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            )}
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="p-5">
          <EmptyState title={transfers.length === 0 ? "No payments yet" : "No payments match these filters"}>
            {transfers.length === 0 ? "Payments you send and receive will appear here." : "Try a different filter or search."}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-semibold">Counterparty</th>
                <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Date</th>
                <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Status</th>
                <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((t) => {
                const incoming = t.direction === "in";
                const other = incoming ? t.payer : t.payee;
                const settledIn = incoming && t.status === "settled";
                return (
                  <tr
                    key={t.tx}
                    onClick={() => router.push(`/transactions/${t.tx}`)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="px-5 py-3">
                      <a href={`/transactions/${t.tx}`} onClick={(e) => e.preventDefault()} className="flex min-w-0 items-center gap-3 outline-none">
                        <Avatar name={other.displayName} seed={other.userId} />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-1.5 truncate font-semibold">
                            <Icon name={incoming ? "arrowDown" : "arrowUp"} className={cn("size-3.5", incoming ? "text-truth" : "text-muted")} />
                            {other.displayName}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {t.kind === "refund" ? "Refund" : incoming ? "Received" : "Sent"}
                            {t.rail === "interbank" && other.bankName && ` · ${other.bankName}`}
                            {t.note && t.kind !== "refund" && ` · ${t.note}`}
                            <span className="md:hidden"> · {formatDateTime(t.createdAt)}</span>
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="hidden px-3 py-3 whitespace-nowrap text-ink-2 md:table-cell">{formatDateTime(t.createdAt)}</td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <span className="flex flex-wrap gap-1">
                        <TransferStatusBadge status={t.status} />
                        {t.confirmedAt && <Badge tone="truth">Confirmed</Badge>}
                        {t.refundedMinor > 0 && <Badge tone="crypto">Part refunded</Badge>}
                      </span>
                    </td>
                    <td className={cn("px-5 py-3 text-right font-semibold whitespace-nowrap tabular-nums", settledIn && "text-truth", t.status === "reversed" && "text-muted line-through")}>
                      {incoming ? "+" : "−"}
                      {formatMoney(t.amountMinor, t.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {limit && rows.length > limit && (
        <footer className="border-t border-line px-5 py-3 text-sm text-muted">
          Showing {limit} of {rows.length} payments
        </footer>
      )}
    </section>
  );
}
