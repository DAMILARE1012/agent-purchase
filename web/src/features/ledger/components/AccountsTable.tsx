import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { LEDGER_CURRENCY } from "../lib/currency";
import type { LedgerAccount } from "@/types/api";

interface AccountsTableProps {
  accounts: LedgerAccount[];
  selected: string | null;
  onSelect: (accountId: string | null) => void;
}

export function AccountsTable({ accounts, selected, onSelect }: AccountsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Account</th>
            <th className="px-4 py-2.5 font-semibold">Owner</th>
            <th className="px-4 py-2.5 text-right font-semibold">Debits</th>
            <th className="px-4 py-2.5 text-right font-semibold">Credits</th>
            <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {accounts.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSelect(selected === a.id ? null : a.id)}
              className={cn("cursor-pointer transition-colors hover:bg-surface-2", selected === a.id && "bg-crypto-bg")}
            >
              <td className="px-4 py-2.5">
                <button type="button" className="flex flex-col items-start text-left" aria-pressed={selected === a.id}>
                  <span className="font-semibold">{a.name}</span>
                  <span className="font-mono text-xs text-muted">{a.id}</span>
                </button>
              </td>
              <td className="px-4 py-2.5">
                {a.kind === "system" ? <Badge tone="crypto">System</Badge> : <span className="text-ink-2">{a.ownerHandle}</span>}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-2">{formatMoney(a.debitsMinor, LEDGER_CURRENCY)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-2">{formatMoney(a.creditsMinor, LEDGER_CURRENCY)}</td>
              <td className={cn("px-4 py-2.5 text-right font-mono font-semibold tabular-nums", a.balanceMinor < 0 && "text-bad")}>
                {formatMoney(a.balanceMinor, LEDGER_CURRENCY)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
