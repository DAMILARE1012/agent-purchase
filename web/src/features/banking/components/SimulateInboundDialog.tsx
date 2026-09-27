"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Dialog, Field, Input, Select } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { useAppDispatch } from "@/store/hooks";
import { useGetExternalAccountsQuery, useSimulateInboundMutation } from "../api";

/** Sandbox: someone at another bank sends you money through the payment network. */
export function SimulateInboundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Receive from another bank"
      description="Sandbox: a test account holder at another bank sends money to your account number through the payment network."
    >
      <InboundForm onDone={onClose} />
    </Dialog>
  );
}

function InboundForm({ onDone }: { onDone: () => void }) {
  const dispatch = useAppDispatch();
  const { data: accounts = [] } = useGetExternalAccountsQuery();
  const [sender, setSender] = useState("");
  const [amount, setAmount] = useState("25.00");
  const [narration, setNarration] = useState("Payment for services");
  const [simulate, { isLoading, error }] = useSimulateInboundMutation();

  const from = accounts.find((a) => `${a.bankCode}:${a.accountNumber}` === sender);
  const amountMinor = parseMoneyInput(amount);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!from || !amountMinor) return;
    const res = await simulate({ fromBankCode: from.bankCode, fromAccountNumber: from.accountNumber, amountMinor, narration });
    if ("data" in res) {
      dispatch(notify(`${formatMoney(amountMinor)} received from ${from.accountName} (${from.bankName}).`));
      onDone();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field id="inbound-sender" label="Sender">
        <Select id="inbound-sender" value={sender} onChange={(e) => setSender(e.target.value)}>
          <option value="">Choose a sender</option>
          {accounts.map((a) => (
            <option key={`${a.bankCode}:${a.accountNumber}`} value={`${a.bankCode}:${a.accountNumber}`}>
              {a.accountName} · {a.bankName}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="inbound-amount" label="Amount (USD)">
        <Input id="inbound-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono tabular-nums" />
      </Field>
      <Field id="inbound-narration" label="Description">
        <Input id="inbound-narration" maxLength={100} value={narration} onChange={(e) => setNarration(e.target.value)} />
      </Field>
      {error && <Alert tone="bad" title="Transfer not received">{errorMessage(error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={isLoading} disabled={!from || !amountMinor}>
          {amountMinor ? `Receive ${formatMoney(amountMinor)}` : "Receive"}
        </Button>
      </div>
    </form>
  );
}
