"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, LoadingState, Money, PageHeader, Select, StatTile } from "@/components/ui";
import { RULE_FAILED } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { formatRelative } from "@/lib/dates";
import { maskName } from "@/lib/mask";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/lib/useNow";
import type { GateRule } from "@/types/domain";
import { useGetBlockedCartsQuery } from "../api";

/** Every cart the gate refused, across shoppers. Shopper names are masked. */
export function BlockedCarts() {
  const { data, error, isLoading } = useGetBlockedCartsQuery(undefined, { pollingInterval: 10_000 });
  const [rule, setRule] = useState<GateRule | "">("");
  const now = useNow();
  const carts = data ?? [];
  const rules = [...new Set(carts.flatMap((c) => c.failedRules))];
  const shown = carts.filter((c) => !rule || c.failedRules.includes(rule));
  const sellersInvolved = new Set(carts.map((c) => c.sellerId)).size;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blocked carts"
        description="Carts the gate refused before any money moved. Look for sellers who keep appearing: they may be trying to trick AI shoppers."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Refused carts" value={carts.length} />
            <StatTile label="Value kept safe" value={formatMoney(carts.reduce((n, c) => n + c.totalMinor, 0))} detail="Never left shoppers' accounts" />
            <StatTile label="Sellers involved" value={sellersInvolved} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Failed rule
              <Select value={rule} onChange={(e) => setRule(e.target.value as GateRule | "")} className="w-56">
                <option value="">Any rule</option>
                {rules.map((r) => <option key={r} value={r}>{RULE_FAILED[r]}</option>)}
              </Select>
            </label>
          </div>
          {shown.length === 0 ? (
            <EmptyState title="No refused carts" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">When</th>
                    <th className="px-4 py-2.5 font-semibold">Shopper</th>
                    <th className="px-4 py-2.5 font-semibold">Seller</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Cart</th>
                    <th className="px-4 py-2.5 font-semibold">Failed rules</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Trace</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((c) => (
                    <tr key={c.runId}>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatRelative(c.decidedAt, now)}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{maskName(c.shopperName)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{c.sellerName}</span>
                        {c.sellerAdversarial && <Badge tone="ai" className="ml-2">Test attacker</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold"><Money amountMinor={c.totalMinor} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">{c.failedRules.map((r) => <Badge key={r} tone="bad">{RULE_FAILED[r]}</Badge>)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/support/runs/${c.runId}`} className="text-sm font-semibold text-crypto hover:underline">Trace</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
