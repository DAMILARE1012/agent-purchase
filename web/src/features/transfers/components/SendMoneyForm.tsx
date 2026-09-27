"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, ButtonLink, Card, Field, Icon, Input, Money } from "@/components/ui";
import { AccountNumberField, BankSelect, formatAccountNumber, TestAccountsPanel, useAccountLookup, useGetBanksQuery } from "@/features/banking";
import { notify } from "@/features/notifications";
import { useGetWalletQuery } from "@/features/wallet/api";
import { errorMessage } from "@/lib/api-error";
import { DEMO_MODE } from "@/lib/demo";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { useAppDispatch } from "@/store/hooks";
import type { RiskSummary, Transfer } from "@/types/api";
import { useCreateTransferMutation } from "../api";
import { SendBackWarning } from "./SendBackWarning";
import { StepUpDialog } from "./StepUpDialog";

interface SendMoneyFormProps {
  initialBankCode?: string;
  initialAccountNumber?: string;
}

/**
 * Bank → account number → confirmed name → amount → description → review → send.
 * The same flow pays someone on this platform (instant) or at another bank (via the network).
 */
export function SendMoneyForm({ initialBankCode = "", initialAccountNumber = "" }: SendMoneyFormProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: wallet } = useGetWalletQuery();
  const { data: banks = [] } = useGetBanksQuery();
  const [createTransfer, { isLoading, error, reset }] = useCreateTransferMutation();

  const [bankChoice, setBankChoice] = useState(initialBankCode);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [submitted, setSubmitted] = useState(false);
  // One key per intended payment: retries reuse it, edits get a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [stepUp, setStepUp] = useState<{ tx: string; risk: RiskSummary } | null>(null);
  const [held, setHeld] = useState<Transfer | null>(null);

  // Default to this platform once the bank list arrives.
  const bankCode = bankChoice || banks.find((b) => b.isPlatform)?.code || "";
  const lookup = useAccountLookup(bankCode, accountNumber);
  const payee = lookup.status === "found" ? lookup.account : null;
  const isSelf = payee?.onPlatform && payee.accountNumber === wallet?.accountNumber;

  const amountMinor = parseMoneyInput(amount);
  const errors = {
    bank: bankCode ? null : "Choose the recipient's bank.",
    // Invalid or unknown numbers are reported by the lookup itself, under the field.
    account: accountNumber.length < 10 ? "Enter the 10-digit account number." : isSelf ? "That's your own account." : null,
    amount:
      amountMinor === null || amountMinor <= 0
        ? "Enter an amount, for example 25.00."
        : wallet && amountMinor > wallet.balanceMinor
          ? `That's more than your balance of ${formatMoney(wallet.balanceMinor)}.`
          : null,
  };
  const ready = Boolean(payee && !isSelf && !errors.bank && !errors.amount);

  function edit<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setIdempotencyKey(newIdempotencyKey());
      reset();
    };
  }

  function finish(tx: string) {
    setIdempotencyKey(newIdempotencyKey());
    dispatch(notify("Payment sent."));
    router.push(`/transactions/${tx}?sent=1`);
  }

  function onReview(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (ready) setStep("review");
  }

  async function onSend() {
    if (!payee || amountMinor === null) return;
    const result = await createTransfer({ bankCode: payee.bankCode, accountNumber: payee.accountNumber, amountMinor, note, idempotencyKey });
    if (!("data" in result) || !result.data) return;
    const { transfer, next, risk } = result.data;
    if (next === "step_up_required") setStepUp({ tx: transfer.tx, risk });
    else if (next === "held") setHeld(transfer);
    else finish(transfer.tx);
  }

  if (held) {
    return (
      <Alert
        tone="ai"
        title="Your payment is on hold for a security check"
        action={<ButtonLink href={`/transactions/${held.tx}`} size="sm" variant="secondary">View payment</ButtonLink>}
      >
        {formatMoney(held.amountMinor)} to {held.payee.displayName} is reserved from your balance but hasn&apos;t been
        sent. Our team will review it shortly. Your receipt already works and shows the live status.
      </Alert>
    );
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {step === "edit" ? (
        <Card className="flex flex-col gap-5">
          <form onSubmit={onReview} noValidate className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <BankSelect value={bankCode} onChange={edit(setBankChoice)} error={submitted ? errors.bank : null} />
              <div className="sm:col-span-2">
                <AccountNumberField
                  value={accountNumber}
                  onChange={edit(setAccountNumber)}
                  lookup={lookup}
                  error={isSelf || submitted ? errors.account : null}
                />
              </div>
            </div>
            <SendBackWarning bankCode={bankCode} accountNumber={accountNumber} />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="amount"
                label="Amount (USD)"
                hint={wallet ? <>Available: <Money amountMinor={wallet.balanceMinor} /></> : undefined}
                error={submitted ? errors.amount : null}
              >
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => edit(setAmount)(e.target.value)}
                  aria-invalid={submitted && Boolean(errors.amount)}
                  className="font-mono text-lg tabular-nums"
                />
              </Field>
              <Field id="note" label="Description" hint="The recipient sees this on their statement.">
                <Input id="note" maxLength={100} placeholder="What's it for?" value={note} onChange={(e) => edit(setNote)(e.target.value)} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <p className="text-sm text-muted">You&apos;ll review the details before anything is sent.</p>
              <Button type="submit" disabled={lookup.status === "loading"}>
                Review payment <Icon name="arrowRight" className="size-4" />
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        payee &&
        amountMinor !== null && (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-muted">Review payment</p>
              <p className="text-4xl font-semibold tracking-tight">{formatMoney(amountMinor)}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-lg border border-line bg-surface-2/50 p-4 text-sm">
              <dt className="text-muted">To</dt>
              <dd className="font-semibold uppercase tracking-wide">{payee.accountName}</dd>
              <dt className="text-muted">Bank</dt>
              <dd>{payee.bankName}</dd>
              <dt className="text-muted">Account number</dt>
              <dd className="font-mono tabular-nums">{formatAccountNumber(payee.accountNumber)}</dd>
              <dt className="text-muted">Description</dt>
              <dd>{note.trim() || <span className="text-muted">None</span>}</dd>
              <dt className="text-muted">Arrives</dt>
              <dd>{payee.onPlatform ? "Instantly" : "Usually within seconds, once the recipient's bank confirms"}</dd>
            </dl>
            {!payee.onPlatform && (
              <p className="flex gap-2 text-sm text-ink-2">
                <Icon name="globe" className="mt-0.5 size-4 shrink-0 text-crypto" />
                This goes to another bank through the payment network. Your receipt will show the network&apos;s confirmation.
              </p>
            )}
            {error && <Alert tone="bad" title="Payment not sent">{errorMessage(error)}</Alert>}
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-5">
              <Button variant="ghost" onClick={() => setStep("edit")}>Back to edit</Button>
              <Button onClick={onSend} loading={isLoading}>
                <Icon name="send" className="size-4" /> Send {formatMoney(amountMinor)}
              </Button>
            </div>
          </Card>
        )
      )}

      <div className="flex flex-col gap-4">
        {wallet?.accountNumber && (
          <Card className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-muted">Paying from</p>
            <p className="font-semibold">{wallet.bankName}</p>
            <p className="font-mono text-sm text-ink-2 tabular-nums">{formatAccountNumber(wallet.accountNumber)}</p>
          </Card>
        )}
        {DEMO_MODE && step === "edit" && (
          <TestAccountsPanel
            onPick={(a) => {
              edit(setBankChoice)(a.bankCode);
              setAccountNumber(a.accountNumber);
            }}
          />
        )}
      </div>

      <StepUpDialog
        tx={stepUp?.tx ?? null}
        risk={stepUp?.risk ?? null}
        onClose={() => setStepUp(null)}
        onVerified={(tx) => {
          setStepUp(null);
          finish(tx);
        }}
      />
    </div>
  );
}
