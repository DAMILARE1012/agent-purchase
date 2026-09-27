"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingState, Money, PageHeader, SegmentedControl } from "@/components/ui";
import { notify } from "@/features/notifications";
import { useGetPurchaseQuery } from "@/features/purchases";
import { GateChecks, useGetRunQuery } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { maskName } from "@/lib/mask";
import { useAppDispatch } from "@/store/hooks";
import type { Dispute } from "@/types/domain";
import { useGetDisputesQuery, useResolveDisputeMutation } from "../api";

/** Shoppers' disputes, settled from the evidence bundle: receipt, cart, gate decision, payment. */
export function Disputes() {
  const { data, error, isLoading } = useGetDisputesQuery();
  const [filter, setFilter] = useState<Dispute["status"]>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = data ?? [];
  const shown = list.filter((d) => d.status === filter);
  const selected = list.find((d) => d.id === selectedId) ?? shown[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Disputes" description="Bank transfers can't be charged back, so disputes are settled from the purchase's signed evidence." />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <SegmentedControl
            label="Show"
            value={filter}
            onChange={(v) => { setFilter(v); setSelectedId(null); }}
            options={[
              { value: "open", label: "Open", count: list.filter((d) => d.status === "open").length },
              { value: "resolved", label: "Resolved", count: list.filter((d) => d.status === "resolved").length },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState title={filter === "open" ? "No open disputes" : "No resolved disputes"} />
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {shown.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      className={cn("flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2/60", selected?.id === d.id && "bg-surface-2")}
                    >
                      <span className="font-semibold">{d.sellerName}</span>
                      <span className="line-clamp-2 text-sm text-ink-2">“{d.reason}”</span>
                      <span className="text-xs text-muted">{maskName(d.shopperName)} · {formatDateTime(d.openedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected && <DisputeEvidence key={selected.id} dispute={selected} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DisputeEvidence({ dispute }: { dispute: Dispute }) {
  const dispatch = useAppDispatch();
  const { data: purchase } = useGetPurchaseQuery(dispute.purchaseId);
  const { data: run } = useGetRunQuery(purchase?.runId ?? "", { skip: !purchase });
  const [resolve, resolving] = useResolveDisputeMutation();

  async function decide(outcome: "refunded" | "rejected") {
    const res = await resolve({ id: dispute.id, outcome });
    if ("data" in res) dispatch(notify(outcome === "refunded" ? "Resolved: the shopper is refunded." : "Resolved: the dispute is rejected."));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">“{dispute.reason}”</h2>
          {dispute.status === "resolved" && (
            <Badge tone={dispute.resolution === "refunded" ? "truth" : "neutral"}>{dispute.resolution === "refunded" ? "Refunded" : "Rejected"}</Badge>
          )}
        </div>
        {purchase ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Purchase</dt><dd className="font-semibold">{purchase.summary}</dd></div>
            <div><dt className="text-muted">Amount</dt><dd className="font-semibold"><Money amountMinor={purchase.totalMinor} /></dd></div>
            <div><dt className="text-muted">Paid to</dt><dd>{purchase.payee.nameOnAccount} · {purchase.payee.bankName} {purchase.payee.accountNumberMasked}</dd></div>
            <div><dt className="text-muted">Bank reference</dt><dd className="font-mono text-xs break-all">{purchase.receipt.networkSessionId}</dd></div>
            <div><dt className="text-muted">Mandate hash</dt><dd className="font-mono text-xs break-all">{purchase.receipt.mandateHash.slice(0, 24)}…</dd></div>
            <div><dt className="text-muted">Receipt</dt><dd><Link href={`/verify#${purchase.receipt.token}`} className="font-semibold text-crypto hover:underline">Verify signature</Link></dd></div>
          </dl>
        ) : (
          <LoadingState label="Loading the evidence…" />
        )}
        {resolving.error && <Alert tone="bad">{errorMessage(resolving.error)}</Alert>}
        {dispute.status === "open" && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button onClick={() => decide("refunded")} loading={resolving.isLoading}>Refund the shopper</Button>
            <Button variant="secondary" onClick={() => decide("rejected")} disabled={resolving.isLoading}>Reject</Button>
            {run && <Link href={`/support/runs/${run.id}`} className="ml-auto self-center text-sm font-semibold text-crypto hover:underline">Full trace</Link>}
          </div>
        )}
      </Card>
      {run?.decision && <GateChecks decision={run.decision} />}
    </div>
  );
}
