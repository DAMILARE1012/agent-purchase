"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Dialog, Field, Input } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { useAppDispatch } from "@/store/hooks";
import type { Currency } from "@/types/api";
import { useRefundPaymentMutation } from "../api";

export interface RefundablePayment {
  tx: string;
  amountMinor: number;
  refundedMinor: number;
  currency: Currency;
  payerName: string;
}

interface RefundDialogProps {
  open: boolean;
  onClose: () => void;
  payment: RefundablePayment;
}

/** Sends money back as a refund linked to the original payment (§6.5). */
export function RefundDialog({ open, onClose, payment }: RefundDialogProps) {
  const firstName = payment.payerName.split(" ")[0];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Refund ${firstName}`}
      description={`${firstName} paid you ${formatMoney(payment.amountMinor, payment.currency)}.`}
    >
      {/* Dialog mounts its children only while open, so each opening starts fresh. */}
      <RefundForm payment={payment} firstName={firstName} onDone={onClose} />
    </Dialog>
  );
}

function RefundForm({ payment, firstName, onDone }: { payment: RefundablePayment; firstName: string; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const refundable = payment.amountMinor - payment.refundedMinor;
  const [amount, setAmount] = useState(() => (refundable / 100).toFixed(2));
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [refund, { isLoading, error }] = useRefundPaymentMutation();

  const amountMinor = parseMoneyInput(amount);
  const invalid =
    amountMinor === null || amountMinor <= 0
      ? "Enter an amount greater than zero."
      : amountMinor > refundable
        ? `You can refund up to ${formatMoney(refundable, payment.currency)}.`
        : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (invalid || amountMinor === null) return;
    const result = await refund({ tx: payment.tx, amountMinor, idempotencyKey });
    if ("data" in result) {
      dispatch(notify(`Refunded ${formatMoney(amountMinor, payment.currency)} to ${firstName}.`));
      onDone();
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        id="refund-amount"
        label="Amount to send back"
        hint={`Up to ${formatMoney(refundable, payment.currency)} can be refunded.`}
        error={amount ? invalid : null}
      >
        <Input
          id="refund-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(invalid)}
          className="font-mono tabular-nums"
        />
      </Field>
      <Alert tone="crypto" title="You're protected">
        This refund is linked to {firstName}&apos;s payment. If that payment is reversed later, you only lose what you
        still hold from it, not the money you sent back.
      </Alert>
      {error && <Alert tone="bad" title="Refund not sent">{errorMessage(error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={isLoading} disabled={Boolean(invalid)}>
          {amountMinor && !invalid ? `Refund ${formatMoney(amountMinor, payment.currency)}` : "Refund"}
        </Button>
      </div>
    </form>
  );
}
