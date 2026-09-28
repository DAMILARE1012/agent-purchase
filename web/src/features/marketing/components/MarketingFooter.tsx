import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SIGN_IN_HREF, SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";

const COLUMNS = [
  { title: "Product", links: [["How it works", "/#how"], ["The gate", "/#gate"], ["For sellers", "/#sellers"], ["Evidence", "/#evidence"]] },
  { title: "Account", links: [["Create account", SIGN_UP_HREF], ["Sign in", SIGN_IN_HREF], ["Verify a receipt", VERIFY_HREF]] },
  { title: "Trust", links: [["Public signing keys", "/.well-known/receipt-keys.json"], ["Questions", "/#faq"]] },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line px-4 pt-14 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-ink text-white"><Icon name="shield" className="size-4" /></span>
              Mandate Gate
            </Link>
            <p className="max-w-xs text-sm text-ink-2">Safe payments for AI shopping. The AI suggests; your mandate decides.</p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3 text-sm">
              <p className="font-semibold">{c.title}</p>
              {c.links.map(([label, href]) => (
                <a key={label} href={href} className="text-ink-2 hover:text-ink">{label}</a>
              ))}
            </nav>
          ))}
        </div>
        <p className="border-t border-line pt-6 text-xs text-muted">
          A sandbox: test money, test banks and test sellers. A real launch needs a licensed payment partner.
        </p>
      </div>
    </footer>
  );
}
