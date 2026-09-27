import { Money, StatTile } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { LEDGER_CURRENCY } from "../lib/currency";
import type { LedgerSummary } from "@/types/api";

/** Headline figures. Debits must equal credits across the whole ledger. */
export function TrialBalance({ summary: s }: { summary: LedgerSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5",
          s.balanced ? "border-truth/50 bg-truth-bg" : "border-bad bg-bad-bg",
        )}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={cn("grid size-10 place-items-center rounded-full bg-surface text-xl font-bold", s.balanced ? "text-truth" : "text-bad")}>
            {s.balanced ? "=" : "≠"}
          </span>
          <div>
            <p className="font-semibold">{s.balanced ? "Trial balance: the ledger balances" : "Trial balance: the ledger does not balance"}</p>
            <p className="text-sm text-ink-2">{s.journalCount} journal entries, each with debits equal to credits</p>
          </div>
        </div>
        <dl className="flex gap-8 text-sm">
          <div><dt className="text-muted">Total debits</dt><dd className="font-mono font-semibold tabular-nums"><Money amountMinor={s.totalDebitsMinor} currency={LEDGER_CURRENCY} /></dd></div>
          <div><dt className="text-muted">Total credits</dt><dd className="font-mono font-semibold tabular-nums"><Money amountMinor={s.totalCreditsMinor} currency={LEDGER_CURRENCY} /></dd></div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Customer balances" value={formatMoney(s.customerBalancesMinor, LEDGER_CURRENCY)} detail="What the platform owes wallet users" />
        <StatTile label="In suspense" value={formatMoney(s.inSuspenseMinor, LEDGER_CURRENCY)} detail="Pending and held payments" />
        <StatTile label="Sandbox funding issued" value={formatMoney(s.fundedMinor, LEDGER_CURRENCY)} detail="Opening balances and welcome credit" />
        <StatTile label="Reversed" value={formatMoney(s.reversedMinor, LEDGER_CURRENCY)} detail="Returned through reversals" />
      </div>
    </div>
  );
}
