import Link from "next/link";
import { Avatar, Icon } from "@/components/ui";
import type { Contact } from "../lib/insights";

/** Frequent contacts, one tap from a new payment. */
export function QuickPay({ contacts }: { contacts: Contact[] }) {
  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">Quick pay</h2>
      </header>
      <ul className="flex flex-col gap-1 p-2">
        {contacts.map((c) => (
          <li key={c.userId}>
            <Link
              href={c.accountNumber && c.bankCode ? `/send?bank=${c.bankCode}&account=${c.accountNumber}` : "/send"}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2"
            >
              <Avatar name={c.displayName} seed={c.userId} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{c.displayName}</span>
                <span className="truncate text-xs text-muted">{c.bankName ?? c.handle} · {c.count} payment{c.count === 1 ? "" : "s"}</span>
              </span>
              <span className="text-xs font-semibold text-muted group-hover:text-crypto">Pay</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/send" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-crypto hover:bg-surface-2">
            <span className="grid size-9 place-items-center rounded-full border border-dashed border-line-strong">
              <Icon name="send" className="size-4" />
            </span>
            Pay someone new
          </Link>
        </li>
      </ul>
    </section>
  );
}
