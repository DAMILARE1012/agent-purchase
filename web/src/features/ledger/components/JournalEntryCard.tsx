import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { LEDGER_CURRENCY } from "../lib/currency";
import type { JournalEntry } from "@/types/api";

/** One posting, shown the way an accountant writes it: debits first, credits indented. */
export function JournalEntryCard({ entry }: { entry: JournalEntry }) {
  return (
    <article className="flex flex-col gap-2 px-4 py-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{entry.memo}</span>
          {entry.transferTx && (
            <Link href={`/transactions/${entry.transferTx}`} className="font-mono text-xs text-crypto hover:underline">
              {entry.transferTx}
            </Link>
          )}
        </div>
        <span className="text-xs text-muted">
          {formatDateTime(entry.createdAt)} · <span className="font-mono">{entry.id}</span>
        </span>
      </header>
      <table className="w-full font-mono text-[13px] tabular-nums">
        <tbody>
          {entry.lines.map((line, i) => (
            <tr key={i} className="border-t border-line/60">
              <td className={line.direction === "CR" ? "py-1 pl-8" : "py-1"}>
                <span className="text-muted">{line.direction}</span> {line.accountName}
                <span className="ml-2 text-[11px] text-muted">{line.accountId}</span>
              </td>
              <td className="w-28 py-1 text-right">{line.direction === "DR" ? formatMoney(line.amountMinor, LEDGER_CURRENCY) : ""}</td>
              <td className="w-28 py-1 text-right">{line.direction === "CR" ? formatMoney(line.amountMinor, LEDGER_CURRENCY) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
