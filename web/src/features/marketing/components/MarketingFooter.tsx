import Link from "next/link";
import { SIGN_IN_HREF, SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/" className="flex items-center gap-2 font-display font-bold">
            <span aria-hidden="true" className="grid size-6 place-items-center rounded bg-ink text-xs text-canvas">✓</span>
            Scan-to-Confirm
          </Link>
          <p className="text-sm text-muted">Verifiable receipts for everyday payments.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
          <a href={VERIFY_HREF} className="hover:text-ink">Verify a receipt</a>
          <a href={SIGN_UP_HREF} className="hover:text-ink">Create account</a>
          <a href={SIGN_IN_HREF} className="hover:text-ink">Sign in</a>
          <a href="/.well-known/receipt-keys.json" className="hover:text-ink">Public signing keys</a>
        </nav>
      </div>
    </footer>
  );
}
