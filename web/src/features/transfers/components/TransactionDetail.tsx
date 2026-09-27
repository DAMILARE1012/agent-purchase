"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Card, CardTitle, ErrorState, LoadingState, Money, PageHeader } from "@/components/ui";
import { DisputeDialog } from "@/features/disputes";
import { notify } from "@/features/notifications";
import { ReceiptCard } from "@/features/receipts";
import { RefundDialog } from "@/features/refunds";
import { useViewer } from "@/features/session";
import { errorMessage } from "@/lib/api-error";
import { formatAccountNumber } from "@/features/banking";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useAppDispatch } from "@/store/hooks";
import { transfersApi, useConfirmReceivedMutation, useGetTransferQuery } from "../api";
import { SandboxActions } from "./SandboxActions";
import { TransferStatusBadge } from "./TransferStatusBadge";
import { TransferTimeline } from "./TransferTimeline";

interface TransactionDetailProps {
  tx: string;
  justSent?: boolean;
  openRefund?: boolean;
}

export function TransactionDetail({ tx, justSent = false, openRefund = false }: TransactionDetailProps) {
  const dispatch = useAppDispatch();
  const { user } = useViewer();
  // While the payment network hasn't answered, refresh every few seconds.
  const cachedStatus = transfersApi.endpoints.getTransfer.useQueryState(tx).data?.transfer.status;
  const { data, isLoading, error } = useGetTransferQuery(tx, { pollingInterval: cachedStatus === "pending" ? 4000 : 0 });
  const [confirm, confirmState] = useConfirmReceivedMutation();
  const [refundOpen, setRefundOpen] = useState(openRefund);
  const [disputeOpen, setDisputeOpen] = useState(false);

  if (isLoading) return <LoadingState label="Loading payment…" />;
  if (error || !data) return <ErrorState message={errorMessage(error) ?? "Payment not found."} />;

  const { transfer: t, refunds, risk } = data;
  const isPayee = t.payee.userId === user?.id;
  const isPayer = t.payer.userId === user?.id;
  const counterparty = isPayee ? t.payer : t.payee;
  const interbank = t.rail === "interbank";
  const otherBank = interbank ? (isPayee ? t.payer : t.payee) : null;
  const canRefund = isPayee && !interbank && t.kind === "payment" && t.status === "settled" && t.refundedMinor < t.amountMinor;
  const canConfirm = isPayee && t.status === "settled" && !t.confirmedAt;

  async function onConfirm() {
    const result = await confirm(t.tx);
    if ("data" in result) dispatch(notify(`Confirmed. ${t.payer.displayName.split(" ")[0]} has been told.`));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.kind === "refund" ? "Refund" : isPayee ? "Payment received" : "Payment sent"}
        title={`${formatMoney(t.amountMinor, t.currency)} ${isPayee ? "from" : "to"} ${counterparty.displayName}`}
        description={t.note ?? undefined}
        actions={<TransferStatusBadge status={t.status} />}
      />

      {interbank && t.status === "pending" && (
        <Alert tone="ai" title={`Waiting for ${otherBank?.bankName} to confirm`}>
          The payment network has your payment. Most confirmations take seconds; this page updates automatically.
        </Alert>
      )}
      {interbank && isPayer && t.status === "failed" && (
        <Alert tone="bad" title="This payment didn't go through">
          The payment network couldn&apos;t complete it, so {formatMoney(t.amountMinor, t.currency)} was returned to your balance.
        </Alert>
      )}
      {justSent && t.status === "settled" && (
        <Alert tone="truth" title="Payment sent">
          Share the receipt so {t.payee.displayName.split(" ")[0]} can check it. They&apos;ll see the live status, not a screenshot.
        </Alert>
      )}
      {isPayer && t.status === "held" && (
        <Alert tone="ai" title="On hold for a security check">
          The money is reserved from your balance. Our team is reviewing this payment.
          {risk && risk.reasons.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {risk.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </Alert>
      )}
      {t.status === "reversed" && (
        <Alert tone="bad" title="This payment was reversed">
          {interbank && isPayer
            ? `${otherBank?.bankName} sent the payment back, and ${formatMoney(t.amountMinor, t.currency)} was returned to your balance.`
            : isPayee && t.refundedMinor > 0
              ? `Because you refunded ${formatMoney(t.refundedMinor, t.currency)} through Refund, only ${formatMoney(t.amountMinor - t.refundedMinor, t.currency)} was taken back from you.`
              : "The money went back to where it came from."}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <CardTitle>Details</CardTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Amount</dt>
              <dd className="font-semibold"><Money amountMinor={t.amountMinor} currency={t.currency} /></dd>
              {t.refundedMinor > 0 && (
                <>
                  <dt className="text-muted">Refunded</dt>
                  <dd><Money amountMinor={t.refundedMinor} currency={t.currency} /></dd>
                </>
              )}
              <dt className="text-muted">From</dt>
              <dd>{t.payer.displayName} <span className="text-muted">{t.payer.handle}</span></dd>
              <dt className="text-muted">To</dt>
              <dd>{t.payee.displayName} <span className="text-muted">{t.payee.handle}</span></dd>
              {otherBank && (
                <>
                  <dt className="text-muted">{isPayee ? "Sender's bank" : "Recipient's bank"}</dt>
                  <dd>{otherBank.bankName}</dd>
                  <dt className="text-muted">Account number</dt>
                  <dd className="font-mono tabular-nums">{formatAccountNumber(otherBank.accountNumber)}</dd>
                  <dt className="text-muted">Network reference</dt>
                  <dd className="font-mono text-xs leading-5">{t.networkSessionId ?? "Not assigned yet"}</dd>
                </>
              )}
              <dt className="text-muted">Created</dt>
              <dd>{formatDateTime(t.createdAt)}</dd>
              {t.refundOf && (
                <>
                  <dt className="text-muted">Refund of</dt>
                  <dd><Link href={`/transactions/${t.refundOf}`} className="font-mono text-xs text-crypto hover:underline">{t.refundOf}</Link></dd>
                </>
              )}
              <dt className="text-muted">ID</dt>
              <dd className="font-mono text-xs leading-5">{t.tx}</dd>
            </dl>

            {(canConfirm || canRefund || isPayee) && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                {canConfirm && <Button onClick={onConfirm} loading={confirmState.isLoading}>I received it</Button>}
                {canRefund && <Button variant="secondary" onClick={() => setRefundOpen(true)}>Refund</Button>}
                {isPayee && <Button variant="ghost" onClick={() => setDisputeOpen(true)}>Report a problem</Button>}
              </div>
            )}
            {confirmState.error && <Alert tone="bad">{errorMessage(confirmState.error)}</Alert>}
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Timeline</CardTitle>
            <TransferTimeline transfer={t} refunds={refunds} />
          </Card>

          {!interbank && <SandboxActions transfer={t} />}
        </div>

        {(isPayer || isPayee) && <ReceiptCard tx={t.tx} />}
      </div>

      {canRefund && (
        <RefundDialog
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          payment={{ tx: t.tx, amountMinor: t.amountMinor, refundedMinor: t.refundedMinor, currency: t.currency, payerName: t.payer.displayName }}
        />
      )}
      <DisputeDialog open={disputeOpen} onClose={() => setDisputeOpen(false)} tx={t.tx} />
    </div>
  );
}
