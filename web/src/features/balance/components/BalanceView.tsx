"use client";

import { Alert, Card, CopyButton, EmptyState, ErrorState, LoadingState, Money, PageHeader } from "@/components/ui";
import { formatAccountNumber } from "@/features/banking";
import { errorMessage } from "@/lib/api-error";
import { formatRelative } from "@/lib/dates";
import { useNow } from "@/lib/useNow";
import { useGetWalletQuery } from "../api";

/** The money the AI shopper pays from. Served by the real API (ledger), not mocks. */
export function BalanceView() {
  const { data: w, error, isLoading } = useGetWalletQuery();
  const now = useNow();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Balance" description="The money your AI shopper pays from. Every movement is a balanced entry on the platform ledger." />
      {isLoading ? (
        <LoadingState />
      ) : error || !w ? (
        <ErrorState message={errorMessage(error) ?? "Couldn't load your balance."} />
      ) : (
        <>
          {w.currency !== "NGN" && (
            <Alert tone="ai" title="Sandbox balance in US dollars">
              This balance comes from the ledger the previous product used, which is still in dollars. It moves to naira when payments are rebuilt
              for AI purchases (milestone M7). AI purchases in the meantime are simulated in naira.
            </Alert>
          )}
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <Card className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted">Available balance</span>
              <Money amountMinor={w.balanceMinor} currency={w.currency} className="font-display text-5xl font-bold tracking-tight" />
            </Card>
            {w.accountNumber && (
              <Card className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-muted">Add money by bank transfer to</span>
                <span className="font-mono text-2xl font-semibold tracking-wider tabular-nums">{formatAccountNumber(w.accountNumber)}</span>
                <span className="text-sm text-ink-2">{w.bankName}</span>
                <CopyButton value={w.accountNumber} label="Copy account number" className="self-start border border-line-strong px-3 py-1.5" />
              </Card>
            )}
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold">Recent money movements</h2>
            {w.recent.length === 0 ? (
              <EmptyState title="Nothing yet" />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {w.recent.map((t) => {
                  const other = t.direction === "in" ? t.payer : t.payee;
                  return (
                    <li key={t.tx} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{t.direction === "in" ? `From ${other.displayName}` : `To ${other.displayName}`}</span>
                        <span className="truncate text-sm text-muted">{t.note ?? "No description"} · {formatRelative(t.createdAt, now)}</span>
                      </div>
                      <span className={t.direction === "in" ? "font-semibold text-truth" : "font-semibold"}>
                        {t.direction === "in" ? "+" : "−"}
                        <Money amountMinor={t.amountMinor} currency={t.currency} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
