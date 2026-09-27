"use client";

import { ButtonLink, Card, ErrorState, LoadingState, Money, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetPurchaseQuery } from "../api";
import { PurchaseStatusBadge } from "./PurchaseBits";
import { ReceiptPanel } from "./ReceiptPanel";

export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const { data: p, error, isLoading } = useGetPurchaseQuery(purchaseId);
  if (isLoading) return <LoadingState />;
  if (error || !p) return <ErrorState message={errorMessage(error) ?? "Purchase not found."} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Purchase from ${p.sellerName}`}
        title={p.summary}
        description={<span className="flex items-center gap-3"><PurchaseStatusBadge status={p.status} /> Paid {formatDateTime(p.paidAt)}</span>}
        actions={
          <>
            <ButtonLink href={`/shop/runs/${p.runId}`} variant="secondary">How the AI chose it</ButtonLink>
            <ButtonLink href={`/shop/mandates/${p.mandateId}`} variant="secondary">Mandate</ButtonLink>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted">Amount paid</span>
            <Money amountMinor={p.totalMinor} className="font-display text-4xl font-bold" />
          </div>
          <dl className="divide-y divide-line text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Seller</dt><dd className="font-semibold">{p.sellerName}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Paid to</dt><dd className="font-semibold">{p.payee.nameOnAccount}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Account</dt><dd>{p.payee.bankName} {p.payee.accountNumberMasked}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="text-muted">Bank reference</dt><dd className="font-mono text-xs break-all">{p.receipt.networkSessionId}</dd></div>
          </dl>
          {p.status === "disputed" && <p className="rounded-lg bg-ai-bg px-3 py-2 text-sm">You&apos;ve opened a dispute. Support is reviewing it with the evidence on this receipt.</p>}
        </Card>
        <ReceiptPanel receipt={p.receipt} />
      </div>
    </div>
  );
}
