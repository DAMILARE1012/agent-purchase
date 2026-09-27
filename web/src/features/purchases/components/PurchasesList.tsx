"use client";

import Link from "next/link";
import { EmptyState, ErrorState, LoadingState, Money, PageHeader, StatTile } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/lib/useNow";
import { useGetPurchasesQuery } from "../api";
import { PurchaseStatusBadge } from "./PurchaseBits";

const DAY = 86_400_000;

export function PurchasesList() {
  const { data, error, isLoading } = useGetPurchasesQuery();
  const now = useNow();
  const purchases = data ?? [];
  const last30 = purchases.filter((p) => now - Date.parse(p.paidAt) <= 30 * DAY);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Purchases" description="What the AI bought for you, each with a signed receipt the seller can verify." />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : purchases.length === 0 ? (
        <EmptyState title="No purchases yet">When you approve a cart, the purchase and its receipt appear here.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Spent in 30 days" value={formatMoney(last30.reduce((n, p) => n + p.totalMinor, 0))} detail={`${last30.length} purchases`} />
            <StatTile label="All purchases" value={purchases.length} />
            <StatTile label="Disputed" value={purchases.filter((p) => p.status === "disputed").length} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">What</th>
                  <th className="px-4 py-2.5 font-semibold">Seller</th>
                  <th className="px-4 py-2.5 font-semibold">Paid</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <Link href={`/shop/purchases/${p.id}`} className="font-semibold hover:underline">{p.summary}</Link>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{p.sellerName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatDateTime(p.paidAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold"><Money amountMinor={p.totalMinor} /></td>
                    <td className="px-4 py-3"><PurchaseStatusBadge status={p.status} /></td>
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
