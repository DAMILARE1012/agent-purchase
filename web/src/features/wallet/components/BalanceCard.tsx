"use client";

import { useState } from "react";
import { Button, ButtonLink, CopyButton, Icon } from "@/components/ui";
import { formatAccountNumber, SimulateInboundDialog } from "@/features/banking";
import { DEMO_MODE } from "@/lib/demo";
import { formatMoney } from "@/lib/money";
import type { Wallet } from "@/types/api";

interface BalanceCardProps {
  wallet: Wallet;
  incomingPendingMinor: number;
}

/** The dashboard's hero figure, plus the details people need to pay you. */
export function BalanceCard({ wallet, incomingPendingMinor }: BalanceCardProps) {
  const [receiveOpen, setReceiveOpen] = useState(false);

  return (
    <div className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl border border-line bg-surface p-6">
      <div aria-hidden="true" className="absolute -top-16 -right-16 size-48 rounded-full bg-truth-bg opacity-70 blur-2xl" />
      <div className="relative flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">Available balance</span>
        <span className="text-5xl font-semibold tracking-tight text-ink">{formatMoney(wallet.balanceMinor, wallet.currency)}</span>
        {incomingPendingMinor > 0 && (
          <span className="mt-1 flex items-center gap-1 text-sm text-ai">
            <Icon name="clock" className="size-3.5" /> {formatMoney(incomingPendingMinor)} on its way
          </span>
        )}
      </div>

      {wallet.accountNumber && (
        <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-muted">Your account details · {wallet.bankName}</span>
            <span className="font-mono text-lg font-semibold tracking-wider tabular-nums">{formatAccountNumber(wallet.accountNumber)}</span>
          </div>
          <CopyButton value={wallet.accountNumber} label="Copy number" />
        </div>
      )}

      <div className="relative flex flex-wrap gap-2">
        <ButtonLink href="/send"><Icon name="send" className="size-4" /> Send money</ButtonLink>
        <ButtonLink href="/r" variant="secondary"><Icon name="qr" className="size-4" /> Verify a receipt</ButtonLink>
        {DEMO_MODE && (
          <Button variant="ghost" onClick={() => setReceiveOpen(true)}>
            <Icon name="arrowDown" className="size-4" /> Receive from another bank
          </Button>
        )}
      </div>
      {DEMO_MODE && <SimulateInboundDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} />}
    </div>
  );
}
