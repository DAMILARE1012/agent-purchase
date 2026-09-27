"use client";

import { Card, CardTitle, ErrorState, LoadingState, Money } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetReceiptQuery } from "../api";
import { ReceiptQr } from "./ReceiptQr";
import { ShareActions } from "./ShareActions";

/** The signed QR receipt, as the payer shares it. */
export function ReceiptCard({ tx }: { tx: string }) {
  const { data: receipt, isLoading, error } = useGetReceiptQuery(tx);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>Receipt</CardTitle>
        <p className="text-sm text-ink-2">
          Share this instead of a screenshot. Whoever scans it sees the payment&apos;s live status.
        </p>
      </div>
      {isLoading && <LoadingState label="Loading receipt…" />}
      {error && <ErrorState message={errorMessage(error)!} />}
      {receipt && (
        <>
          <div className="flex flex-wrap items-center gap-5 rounded-md border border-dashed border-line-strong p-4">
            <ReceiptQr value={receipt.url} />
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Amount</dt>
              <dd className="font-semibold"><Money amountMinor={receipt.printed.amountMinor} currency={receipt.printed.currency} /></dd>
              <dt className="text-muted">From</dt>
              <dd>{receipt.printed.payerMasked}</dd>
              <dt className="text-muted">To</dt>
              <dd>{receipt.printed.payeeMasked}</dd>
              <dt className="text-muted">Date</dt>
              <dd>{formatDateTime(receipt.printed.createdAt)}</dd>
              <dt className="text-muted">ID</dt>
              <dd className="truncate font-mono text-xs leading-5">{receipt.tx}</dd>
            </dl>
          </div>
          <ShareActions receipt={receipt} />
        </>
      )}
    </Card>
  );
}
