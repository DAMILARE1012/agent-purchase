"use client";

import { useState } from "react";
import { Alert, ButtonLink, Card, ErrorState, LoadingState, Money, PageHeader } from "@/components/ui";
import { useGetRunQuery } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetPurchaseQuery } from "../api";
import { PurchaseStatusBadge } from "./PurchaseBits";
import { ReceiptPanel } from "./ReceiptPanel";

export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  // While the bank hasn't confirmed, check every few seconds (adjusted during render, as React recommends for derived state).
  const [poll, setPoll] = useState(0);
  const { data: p, error, isLoading } = useGetPurchaseQuery(purchaseId, { pollingInterval: poll });
  const wanted = p?.status === "pending" ? 3000 : 0;
  if (wanted !== poll) setPoll(wanted);
  const { data: run } = useGetRunQuery(p?.runId ?? "", { skip: !p });
  if (isLoading) return <LoadingState />;
  if (error || !p) return <ErrorState message={errorMessage(error) ?? "Purchase not found."} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Purchase from ${p.sellerName}`}
        title={p.summary}
        description={<span className="flex items-center gap-3"><PurchaseStatusBadge status={p.status} /> {p.status === "paid" ? "Paid" : "Approved"} {formatDateTime(p.paidAt)}</span>}
        actions={
          <>
            {run && <ButtonLink href={`/shop/runs/${p.runId}`} variant="secondary">How the AI chose it</ButtonLink>}
            <ButtonLink href={`/shop/mandates/${p.mandateId}`} variant="secondary">Mandate</ButtonLink>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted">{p.status === "paid" || p.status === "refunded" ? "Amount paid" : "Amount"}</span>
            <Money amountMinor={p.totalMinor} className="font-display text-4xl font-bold" />
          </div>
          <dl className="divide-y divide-line text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Seller</dt><dd className="font-semibold">{p.sellerName}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Paid to</dt><dd className="font-semibold">{p.payee.nameOnAccount}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Account</dt><dd>{p.payee.bankName} {p.payee.accountNumberMasked}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Bank reference</dt><dd className="font-mono text-xs break-all">{p.receipt.networkSessionId || "Not yet"}</dd></div>
          </dl>
          {p.lines && p.lines.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {p.lines.map((l) => (
                <li key={l.sku} className="flex justify-between gap-3 px-3 py-2">
                  <span>{l.quantity} × {l.name}</span>
                  <Money amountMinor={l.lineTotalMinor} className="shrink-0 font-semibold" />
                </li>
              ))}
            </ul>
          )}
          {p.status === "pending" && <Alert tone="ai" title="Waiting for the bank">Your money is held and the transfer is with the bank. This page updates when it confirms.</Alert>}
          {(p.status === "failed" || p.status === "reversed") && (
            <Alert tone="bad" title={p.status === "failed" ? "The bank transfer failed" : "The seller's bank sent the money back"}>
              Nothing was paid; the money is back in your balance and the mandate can be used again.
            </Alert>
          )}
          {p.status === "disputed" && <p className="rounded-lg bg-ai-bg px-3 py-2 text-sm">You&apos;ve opened a dispute. Support is reviewing it with the evidence on this receipt.</p>}
        </Card>
        <ReceiptPanel receipt={p.receipt} />
      </div>
    </div>
  );
}
