"use client";

import { useSyncExternalStore } from "react";
import { ReceiptQr } from "@/features/receipts";
import { Icon } from "@/components/ui/Icon";

const noSubscribe = () => () => {};

const CHECKS = ["Signed by the platform", "Money has arrived", "Paid to you", "Not used before"];

/**
 * The pitch in one picture: the screenshot you're sent (edited) next to what
 * scanning the receipt actually shows (the ledger's answer).
 */
export function HeroVisual() {
  // The sample QR opens this site's verify page; the origin is only known in the browser.
  const verifyUrl = useSyncExternalStore(noSubscribe, () => `${window.location.origin}/r`, () => "/r");

  return (
    <div className="relative mx-auto h-[520px] w-full max-w-[480px]" aria-label="An edited payment screenshot next to a verified receipt" role="img">
      {/* What you're sent */}
      <div className="absolute top-20 left-0 hidden w-56 -rotate-6 rounded-2xl border border-line bg-surface p-5 shadow-xl sm:block">
        <p className="text-xs text-muted">Screenshot you were sent</p>
        <div className="mt-4 flex flex-col items-center gap-1 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-truth-bg text-truth"><Icon name="check" /></span>
          <p className="font-semibold">Payment successful</p>
          <p className="font-display text-3xl font-bold tabular-nums">$2,500.00</p>
          <p className="text-xs text-muted">To R•••• A•••• · Ref 88231</p>
        </div>
        <span className="absolute -top-3 -left-3 -rotate-12 rounded-md border-2 border-bad bg-bad-bg px-2.5 py-1 font-mono text-xs font-bold tracking-widest text-bad shadow">
          EDITED
        </span>
      </div>

      {/* What scanning shows */}
      <div className="absolute top-0 left-1/2 w-[280px] -translate-x-1/2 rounded-[2rem] border-[6px] border-ink bg-surface p-4 shadow-2xl sm:right-0 sm:left-auto sm:translate-x-0">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-line-strong" />
        <p className="text-center text-xs font-semibold text-muted">Scan-to-Confirm · Verify</p>

        <div className="relative mx-auto mt-3 w-fit overflow-hidden rounded-lg" style={{ ["--scan-distance" as string]: "150px" }}>
          <ReceiptQr value={verifyUrl} size={156} />
          <span aria-hidden="true" className="animate-scan absolute inset-x-1 top-1 h-0.5 rounded-full bg-truth shadow-[0_0_12px_2px] shadow-truth/60" />
        </div>

        <div className="mt-4 rounded-xl border-2 border-truth bg-truth-bg p-3">
          <p className="font-mono text-[10px] font-bold tracking-widest text-truth">VERIFIED</p>
          <p className="font-display text-lg font-bold">Payment received</p>
          <p className="text-sm text-ink-2">
            <span className="font-semibold tabular-nums text-ink">$250.00</span> from Sam arrived at 14:02
          </p>
        </div>

        <ul className="mt-3 flex flex-col gap-1.5">
          {CHECKS.map((c) => (
            <li key={c} className="flex items-center gap-2 text-xs text-ink-2">
              <span className="grid size-4 place-items-center rounded-full bg-truth-bg text-truth"><Icon name="check" className="size-3" /></span>
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-xs text-ink">
          The screenshot says <b>$2,500.00</b>. The real payment was <b>$250.00</b>.
        </p>
      </div>
    </div>
  );
}
