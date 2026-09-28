"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Dialog, Field, Icon, Input, Money } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import type { AgentRun, Purchase } from "@/types/domain";
import { useApproveCartMutation, useSendEmailCodeMutation } from "../api";

const RESEND_AFTER_S = 60;

interface EmailCodeDialogProps {
  open: boolean;
  onClose: () => void;
  run: AgentRun;
  onPaid: (purchase: Purchase) => void;
}

/**
 * Approving with a one-time code sent to the shopper's email: the fallback when no passkey
 * is at hand. The code only works for this exact cart, and only up to the email-approval limit.
 */
export function EmailCodeDialog({ open, onClose, run, onPaid }: EmailCodeDialogProps) {
  const cart = run.cart!;
  const [send, sending] = useSendEmailCodeMutation();
  const [approve, approving] = useApproveCartMutation();
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  async function sendCode() {
    const res = await send(cart.id);
    if ("data" in res && res.data) {
      setSentTo(res.data.sentTo);
      setWait(RESEND_AFTER_S);
      setCode("");
    }
  }

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function pay() {
    const res = await approve({ cartId: cart.id, runId: run.id, mandateId: run.mandateId, signature: { kind: "email_code", code: code.trim() } });
    if ("data" in res && res.data) onPaid(res.data);
  }

  function close() {
    if (approving.isLoading) return;
    setCode("");
    setSentTo(null);
    sending.reset();
    approving.reset();
    onClose();
  }

  const valid = /^\d{6}$/.test(code.trim());

  return (
    <Dialog open={open} onClose={close} title="Approve with an email code">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) void pay(); }}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Amount</dt><dd className="font-semibold"><Money amountMinor={cart.totalMinor} /></dd>
          <dt className="text-muted">To</dt><dd className="font-semibold">{cart.payee.nameOnAccount}</dd>
          <dt className="text-muted">Account</dt><dd>{cart.payee.bankName} {cart.payee.accountNumberMasked}</dd>
        </dl>
        {sentTo ? (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
            <Icon name="send" className="mt-0.5 size-4 shrink-0 text-ink-2" />
            <span>We sent a 6-digit code to <b>{sentTo}</b>. It works for this payment only and expires in 5 minutes.</span>
          </p>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
            <p>We&apos;ll email you a 6-digit code that approves exactly this payment.</p>
            <Button size="sm" onClick={sendCode} loading={sending.isLoading}><Icon name="send" className="size-4" /> Email me a code</Button>
          </div>
        )}
        {sending.error && <Alert tone="bad">{errorMessage(sending.error)}</Alert>}
        <Field id="email-code" label="Code from the email">
          <Input
            id="email-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="max-w-40 font-mono text-lg tracking-[0.3em]"
            disabled={!sentTo}
          />
        </Field>
        {approving.error && <Alert tone="bad" title="Nothing was paid">{errorMessage(approving.error)}</Alert>}
        <p className="text-xs text-muted">
          An email code is weaker than a passkey: anyone with access to your email could use it. Your receipt records how you approved.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sentTo ? (
            <Button variant="ghost" size="sm" onClick={sendCode} disabled={wait > 0 || sending.isLoading}>
              {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close} disabled={approving.isLoading}>Cancel</Button>
            <Button type="submit" loading={approving.isLoading} disabled={!valid}>Pay {formatMoney(cart.totalMinor)}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
