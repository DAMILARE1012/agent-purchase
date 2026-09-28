"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Icon, Money } from "@/components/ui";
import { notify } from "@/features/notifications";
import { PasskeyPrompt } from "@/features/passkeys";
import { errorMessage } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { signWithPasskey } from "@/lib/webauthn";
import { useAppDispatch } from "@/store/hooks";
import type { AgentRun, Purchase } from "@/types/domain";
import { useApproveCartMutation, useCartApprovalOptionsMutation, useDeclineCartMutation, useGetApprovalMethodsQuery } from "../api";
import { EmailCodeDialog } from "./EmailCodeDialog";

/**
 * Approve (pay) or decline a cart the gate allowed. Approving is a passkey signature over
 * the seller-signed cart's hash; the gate then checks everything again before any money moves.
 */
export function ApprovalPanel({ run }: { run: AgentRun }) {
  const cart = run.cart!;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const { data: methods } = useGetApprovalMethodsQuery(cart.id);
  const [cartHash, setCartHash] = useState<string | null>(null);
  const [getOptions] = useCartApprovalOptionsMutation();
  const [approve] = useApproveCartMutation();
  const [decline, declining] = useDeclineCartMutation();
  const warnings = run.decision?.checks.filter((c) => c.result === "warn") ?? [];

  async function pay() {
    const options = await getOptions(cart.id).unwrap();
    setCartHash(options.cartHash);
    const credential = await signWithPasskey(options.publicKey);
    const purchase = await approve({
      cartId: cart.id, runId: run.id, mandateId: run.mandateId,
      signature: { kind: "passkey", challengeId: options.challengeId, credential },
    }).unwrap();
    paid(purchase);
  }

  /** After either approval (passkey or email code): to the purchase and its receipt. */
  function paid(purchase: Purchase) {
    setOpen(false);
    setEmailOpen(false);
    dispatch(notify(purchase.status === "paid" ? `Paid ${cart.sellerName}. Your receipt is ready.` : "Payment sent. Waiting for the bank to confirm."));
    router.push(`/shop/purchases/${purchase.id}`);
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
      {methods?.emailCode.available ? (
        <button type="button" onClick={() => setEmailOpen(true)} className="self-start text-sm font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">
          No passkey on this device? Approve with a code sent to {methods.emailCode.sentTo}
        </button>
      ) : methods?.emailCode.reason && methods.emailCode.limitMinor < cart.totalMinor ? (
        <p className="text-xs text-muted">{methods.emailCode.reason}</p>
      ) : null}
      <EmailCodeDialog open={emailOpen} onClose={() => setEmailOpen(false)} run={run} onPaid={paid} />
      <PasskeyPrompt
        open={open}
        onClose={() => { setOpen(false); setCartHash(null); }}
        title="Approve this payment"
        confirmLabel={`Pay ${formatMoney(cart.totalMinor)}`}
        onSign={pay}
        errorTitle="Nothing was paid"
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Amount</dt><dd className="font-semibold"><Money amountMinor={cart.totalMinor} /></dd>
          <dt className="text-muted">To</dt><dd className="font-semibold">{cart.payee.nameOnAccount}</dd>
          <dt className="text-muted">Account</dt><dd>{cart.payee.bankName} {cart.payee.accountNumberMasked}</dd>
          <dt className="text-muted">Seller</dt><dd>{cart.sellerName}</dd>
        </dl>
        {cartHash && (
          <>
            <p className="mt-3 text-muted">Cart hash being approved</p>
            <p className="break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">{cartHash}</p>
          </>
        )}
        <p className="mt-3 text-muted">The gate checks the cart again at the moment of payment. If anything changed, nothing is paid.</p>
      </PasskeyPrompt>
    </Card>
  );
}
