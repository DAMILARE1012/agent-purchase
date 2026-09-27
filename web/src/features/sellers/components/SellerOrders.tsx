"use client";

import { useState } from "react";
import { Alert, Badge, Button, Dialog, EmptyState, ErrorState, Icon, LoadingState, Money, PageHeader, StatTile, type Tone } from "@/components/ui";
import { notify } from "@/features/notifications";
import { useVerifyReceiptQuery } from "@/features/purchases";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/lib/useNow";
import { useAppDispatch } from "@/store/hooks";
import type { SellerOrder } from "@/types/domain";
import { useGetMyOrdersQuery, useGetMySellerProfileQuery, useRefundOrderMutation } from "../api";

const STATUS: Record<SellerOrder["status"], { label: string; tone: Tone }> = {
  to_fulfil: { label: "To deliver", tone: "crypto" },
  delivered: { label: "Delivered", tone: "neutral" },
  refunded: { label: "Refunded", tone: "bad" },
};

/** The seller's order book: purchases AI shoppers made from this store. */
export function SellerOrders() {
  const { data: orders, error, isLoading } = useGetMyOrdersQuery();
  const { data: profile } = useGetMySellerProfileQuery();
  const [open, setOpen] = useState<SellerOrder | null>(null);
  const now = useNow();

  const list = orders ?? [];
  const toDeliver = list.filter((o) => o.status === "to_fulfil");
  const month = list.filter((o) => o.status !== "refunded" && now - Date.parse(o.paidAt) <= 30 * 86_400_000);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={profile?.displayName}
        title="Orders"
        description="Purchases shoppers' AI agents made from your store. Each is paid into your verified account and comes with a signed receipt."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="To deliver" value={toDeliver.length} detail={toDeliver.length ? `Next due ${formatRelative(toDeliver.map((o) => o.deliverBy).sort()[0], now)}` : "All caught up"} />
            <StatTile label="Paid in 30 days" value={formatMoney(month.reduce((n, o) => n + o.totalMinor, 0))} detail={`${month.length} orders`} />
            <StatTile label="Refunded" value={list.filter((o) => o.status === "refunded").length} />
          </div>
          {list.length === 0 ? (
            <EmptyState title="No orders yet">When a shopper&apos;s AI buys from you, the order appears here.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Order</th>
                    <th className="px-4 py-2.5 font-semibold">Shopper</th>
                    <th className="px-4 py-2.5 font-semibold">Paid</th>
                    <th className="px-4 py-2.5 font-semibold">Deliver by</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((o) => (
                    <tr key={o.id}>
                      <td className="max-w-72 px-4 py-3 font-semibold">{o.summary}</td>
                      <td className="px-4 py-3 text-ink-2">{o.shopperName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatDateTime(o.paidAt)}</td>
                      <td className={cn("px-4 py-3 whitespace-nowrap", o.status === "to_fulfil" ? "font-semibold" : "text-ink-2")}>{formatDateTime(o.deliverBy)}</td>
                      <td className="px-4 py-3 text-right font-semibold"><Money amountMinor={o.totalMinor} /></td>
                      <td className="px-4 py-3"><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(o)}>Receipt</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <OrderDialog order={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** The order's receipt, checked live, plus the refund action. */
function OrderDialog({ order, onClose }: { order: SellerOrder | null; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { data: check, isFetching } = useVerifyReceiptQuery(order?.receiptToken ?? "", { skip: !order });
  const [refund, refunding] = useRefundOrderMutation();
  const [confirm, setConfirm] = useState(false);

  async function doRefund() {
    if (!order) return;
    const res = await refund(order.id);
    if ("data" in res) {
      dispatch(notify(`Refunded ${formatMoney(order.totalMinor)} to ${order.shopperName}.`));
      setConfirm(false);
      onClose();
    }
  }

  return (
    <Dialog open={!!order} onClose={() => { setConfirm(false); onClose(); }} title="Order receipt" description={order ? `${order.summary} · ${order.shopperName}` : undefined}>
      {order && (
        <div className="flex flex-col gap-4">
          {isFetching || !check ? (
            <LoadingState label="Checking the receipt…" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {check.checks.map((c) => (
                <li key={c.label} className="flex gap-2">
                  <Icon name={c.result === "pass" ? "check" : c.result === "fail" ? "close" : "alert"} className={cn("mt-0.5 size-4", c.result === "pass" ? "text-truth" : c.result === "fail" ? "text-bad" : "text-ai")} />
                  <span><b>{c.label}.</b> <span className="text-ink-2">{c.detail}</span></span>
                </li>
              ))}
            </ul>
          )}
          {refunding.error && <Alert tone="bad">{errorMessage(refunding.error)}</Alert>}
          {order.status !== "refunded" && (
            confirm ? (
              <Alert tone="ai" title={`Refund ${formatMoney(order.totalMinor)} to ${order.shopperName}?`} action={
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Keep</Button>
                  <Button size="sm" variant="danger" loading={refunding.isLoading} onClick={doRefund}>Refund</Button>
                </div>
              }>
                The money goes back to the shopper by bank transfer, linked to this receipt.
              </Alert>
            ) : (
              <Button variant="secondary" className="self-start" onClick={() => setConfirm(true)}>Refund this order</Button>
            )
          )}
        </div>
      )}
    </Dialog>
  );
}
