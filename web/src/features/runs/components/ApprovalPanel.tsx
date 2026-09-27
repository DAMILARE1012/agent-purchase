"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Icon, Money } from "@/components/ui";
import { PasskeyDialog } from "@/features/mandates";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useAppDispatch } from "@/store/hooks";
import type { AgentRun } from "@/types/domain";
import { useApproveCartMutation, useDeclineCartMutation } from "../api";

/** Approve (pay) or decline a cart the gate allowed. */
export function ApprovalPanel({ run }: { run: AgentRun }) {
  const cart = run.cart!;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [approve, approval] = useApproveCartMutation();
  const [decline, declining] = useDeclineCartMutation();
  const warnings = run.decision?.checks.filter((c) => c.result === "warn") ?? [];

  async function pay() {
    const res = await approve({ cartId: cart.id, runId: run.id, mandateId: run.mandateId });
    if ("data" in res && res.data) {
      dispatch(notify(`Paid ${cart.sellerName}. Your receipt is ready.`));
      router.push(`/shop/purchases/${res.data.id}`);
    }
  }

  return (
    <Card className="flex flex-col gap-4 border-crypto">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">Pay for this cart?</h3>
        <p className="text-ink-2">
          <Money amountMinor={cart.totalMinor} className="font-semibold text-ink" /> to <b>{cart.payee.nameOnAccount}</b>, {cart.payee.bankName} {cart.payee.accountNumberMasked}.
          A bank transfer can&apos;t be undone.
        </p>
      </div>
      {warnings.length > 0 && (
        <Alert tone="ai" title="Check before you pay">
          <ul className="list-disc pl-4">{warnings.map((w) => <li key={w.rule}>{w.detail}</li>)}</ul>
        </Alert>
      )}
      {declining.error && <Alert tone="bad">{errorMessage(declining.error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}><Icon name="key" className="size-4" /> Approve and pay</Button>
        <Button variant="secondary" loading={declining.isLoading} onClick={() => decline({ cartId: cart.id, runId: run.id })}>Decline</Button>
      </div>
      <PasskeyDialog
        open={open}
        onClose={() => { setOpen(false); approval.reset(); }}
        title="Approve this payment"
        confirmLabel={`Pay ${formatMoney(cart.totalMinor)}`}
        onConfirm={pay}
        error={errorMessage(approval.error)}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Amount</dt><dd className="font-semibold"><Money amountMinor={cart.totalMinor} /></dd>
          <dt className="text-muted">To</dt><dd className="font-semibold">{cart.payee.nameOnAccount}</dd>
          <dt className="text-muted">Account</dt><dd>{cart.payee.bankName} {cart.payee.accountNumberMasked}</dd>
          <dt className="text-muted">Seller</dt><dd>{cart.sellerName}</dd>
        </dl>
        <p className="mt-3 text-muted">The gate checks the cart again at the moment of payment. If anything changed, nothing is paid.</p>
      </PasskeyDialog>
    </Card>
  );
}
