"use client";

import { Alert, ButtonLink } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useListTransfersQuery } from "../api";
import { findRecentPaymentFrom } from "../lib/sendBack";

/** Warns when paying someone who recently paid you (overpayment scams, §6.5). */
export function SendBackWarning({ bankCode, accountNumber }: { bankCode: string; accountNumber: string }) {
  const { data: transfers = [] } = useListTransfersQuery();
  const recent = bankCode && accountNumber.length === 10 ? findRecentPaymentFrom(transfers, bankCode, accountNumber) : undefined;
  if (!recent) return null;

  const name = recent.payer.displayName.split(" ")[0];
  return (
    <Alert
      tone="ai"
      title={`Sending money back to ${name}?`}
      action={
        <ButtonLink href={`/transactions/${recent.tx}?refund=1`} size="sm" variant="secondary">
          Refund their payment instead
        </ButtonLink>
      }
    >
      {name} paid you {formatMoney(recent.amountMinor, recent.currency)} on {formatDateTime(recent.createdAt)}. If
      you&apos;re returning money, use Refund on that payment. Then if their payment is reversed later, you only lose
      what you still hold.
    </Alert>
  );
}
