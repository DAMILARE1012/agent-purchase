"use client";

import { useSyncExternalStore } from "react";
import { ButtonLink, Card, CopyButton, Icon } from "@/components/ui";
import { ReceiptQr } from "@/features/receipts";
import { formatDateTime } from "@/lib/dates";
import type { PurchaseReceipt } from "@/types/domain";
import { receiptLink } from "../lib/token";

const noSubscribe = () => () => {};

/** The signed receipt: a QR the seller scans, and everything it binds together. */
export function ReceiptPanel({ receipt }: { receipt: PurchaseReceipt }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const link = receiptLink(origin, receipt.token);

  const fields: Array<[label: string, value: string]> = [
    ["Your mandate (hash)", receipt.mandateHash],
    ["Seller's cart (hash)", receipt.cartHash],
    ["Gate version", receipt.gateVersion],
    ["AI shopper version", receipt.agentVersion],
    ["Bank session ID", receipt.networkSessionId],
    ["Signing key", receipt.signingKeyId],
  ];

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon name="receipt" className="size-5 text-crypto" /> Signed receipt</h2>
        <span className="text-sm text-muted">Issued {formatDateTime(receipt.issuedAt)}</span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {origin && <ReceiptQr value={link} size={168} />}
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>
            The seller scans this to check that you authorised the purchase, the gate allowed it and the bank paid it. It proves more than a
            transfer screenshot ever could.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/verify#${receipt.token}`} variant="secondary" size="sm">Check it yourself</ButtonLink>
            <CopyButton value={link} label="Copy receipt link" className="border border-line-strong px-3 py-1.5" />
          </div>
        </div>
      </div>
      <dl className="divide-y divide-line border-t border-line text-sm">
        {fields.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="font-mono text-xs break-all text-ink sm:text-[13px]">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
