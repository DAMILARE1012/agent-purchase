"use client";

import { useMemo } from "react";
import { ErrorState, LoadingState, PageHeader, StatTile } from "@/components/ui";
import { useListTransfersQuery } from "@/features/transfers";
import { errorMessage } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { ActivityTable } from "./ActivityTable";

/** Every payment the user has sent or received, searchable and filterable. */
export function ActivityPage() {
  const { data, isLoading, error } = useListTransfersQuery(undefined, { refetchOnFocus: true });
  const transfers = useMemo(() => data ?? [], [data]);
  const summary = useMemo(() => {
    const settled = transfers.filter((t) => t.status === "settled");
    return {
      count: transfers.length,
      inMinor: settled.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountMinor, 0),
      outMinor: settled.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountMinor, 0),
      toConfirm: transfers.filter((t) => t.direction === "in" && t.kind === "payment" && t.status === "settled" && !t.confirmedAt).length,
    };
  }, [transfers]);

  if (isLoading) return <LoadingState label="Loading activity…" />;
  if (error) return <ErrorState message={errorMessage(error)!} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Activity" description="Every payment you've sent and received. Select one to see its receipt and timeline." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Payments" value={summary.count} detail="All time" />
        <StatTile label="Received" marker="var(--chart-in)" value={formatMoney(summary.inMinor)} detail="Settled, all time" />
        <StatTile label="Sent" marker="var(--chart-out)" value={formatMoney(summary.outMinor)} detail="Settled, all time" />
        <StatTile label="Waiting for your confirmation" value={summary.toConfirm} detail="Payments you received but haven't confirmed" />
      </div>
      <ActivityTable transfers={transfers} title="All payments" />
    </div>
  );
}
