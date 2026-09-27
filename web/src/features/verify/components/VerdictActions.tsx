"use client";

import { useState } from "react";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { DisputeDialog } from "@/features/disputes";
import { notify } from "@/features/notifications";
import { RefundDialog } from "@/features/refunds";
import { useViewer } from "@/features/session";
import { useConfirmReceivedMutation } from "@/features/transfers";
import { errorMessage } from "@/lib/api-error";
import { useAppDispatch } from "@/store/hooks";
import type { ScanResult } from "@/types/api";

/** What the viewer can do next: confirm, refund, report, or look at the payment. */
export function VerdictActions({ result, onCheckAnother }: { result: ScanResult; onCheckAnother: () => void }) {
  const dispatch = useAppDispatch();
  const { hasWallet } = useViewer();
  const [confirm, confirmState] = useConfirmReceivedMutation();
  const [refundOpen, setRefundOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const t = result.transfer;
  const confirmed = confirmState.isSuccess;
  const payerFirstName = t?.payerName?.split(" ")[0] ?? "The sender";

  async function onConfirm() {
    if (!t) return;
    const res = await confirm(t.tx);
    if ("data" in res) dispatch(notify(`Confirmed. ${payerFirstName} has been told.`));
  }

  return (
    <div className="flex flex-col gap-3">
      {confirmed && (
        <Alert tone="truth" title="Payment confirmed">
          You confirmed this payment. If anyone shows you this receipt again, it will say it was already confirmed.
        </Alert>
      )}
      {confirmState.error && <Alert tone="bad">{errorMessage(confirmState.error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        {result.canConfirm && !confirmed && (
          <Button onClick={onConfirm} loading={confirmState.isLoading}>I received it</Button>
        )}
        {result.canRefund && (
          <Button variant="secondary" onClick={() => setRefundOpen(true)}>Refund</Button>
        )}
        {t && result.view !== "public" && (
          <ButtonLink href={`/transactions/${t.tx}`} variant="secondary">View payment</ButtonLink>
        )}
        {hasWallet && result.verdict !== "VERIFIED" && (
          <Button variant="ghost" onClick={() => setDisputeOpen(true)}>Report a problem</Button>
        )}
        <Button variant="ghost" onClick={onCheckAnother}>Check another receipt</Button>
      </div>

      {t && result.canRefund && (
        <RefundDialog
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          payment={{ tx: t.tx, amountMinor: t.amountMinor, refundedMinor: t.refundedMinor, currency: t.currency, payerName: t.payerName ?? "Sender" }}
        />
      )}
      <DisputeDialog open={disputeOpen} onClose={() => setDisputeOpen(false)} tx={t?.tx} scanId={result.scanId} />
    </div>
  );
}
