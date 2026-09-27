"use client";

import type { ExternalAccount } from "@/types/api";
import { useGetExternalAccountsQuery } from "../api";
import { formatAccountNumber } from "../lib/accountNumber";

const TEST_AMOUNTS = [
  { cents: ".13", effect: "times out, then succeeds after 30 s" },
  { cents: ".14", effect: "times out, then fails and the money comes back" },
  { cents: ".66", effect: "succeeds, then the other bank reverses it after 60 s" },
  { cents: "other", effect: "succeeds instantly" },
];

/** Sandbox only: test account holders at other banks, and amounts that trigger each network outcome. */
export function TestAccountsPanel({ onPick }: { onPick?: (account: ExternalAccount) => void }) {
  const { data: accounts = [] } = useGetExternalAccountsQuery();

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-dashed border-line-strong bg-surface p-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Sandbox</p>
        <h2 className="font-semibold">Test accounts at other banks</h2>
        <p className="text-sm text-ink-2">These people exist on the sandbox payment network.{onPick && " Pick one to fill in the form."}</p>
      </div>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {accounts.map((a) => (
          <li key={`${a.bankCode}-${a.accountNumber}`}>
            <button
              type="button"
              onClick={() => onPick?.(a)}
              disabled={!onPick}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
            >
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{a.accountName}</span>
                <span className="truncate text-xs text-muted">{a.bankName}</span>
              </span>
              <span className="font-mono text-xs text-ink-2 tabular-nums">{formatAccountNumber(a.accountNumber)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-sm font-semibold">Test amounts</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {TEST_AMOUNTS.map((t) => (
            <div key={t.cents} className="contents">
              <dt className="font-mono font-semibold">{t.cents === "other" ? "Other" : `$x${t.cents}`}</dt>
              <dd className="text-ink-2">{t.effect}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
