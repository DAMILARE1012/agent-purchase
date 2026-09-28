"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { homeFor } from "@/components/layout/navigation";
import { useViewer } from "@/features/session";
import { SIGN_IN_HREF, SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#gate", label: "The gate" },
  { href: "#sellers", label: "For sellers" },
  { href: "#evidence", label: "Evidence" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingHeader() {
  const { user, isSignedIn, isLoading } = useViewer();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-display text-lg font-bold whitespace-nowrap">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-ink text-white"><Icon name="shield" className="size-4" /></span>
          Mandate Gate
        </Link>
        <nav aria-label="Page sections" className="hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {/* Wrapped: the button's own inline-flex would override a `hidden` on the link itself. */}
          <span className="hidden lg:block">
            <a href={VERIFY_HREF} className={buttonClasses("ghost", "sm", "whitespace-nowrap")}>Verify a receipt</a>
          </span>
          {isLoading ? (
            <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
          ) : isSignedIn ? (
            <Link href={homeFor(user?.role)} className={buttonClasses("primary", "sm", "whitespace-nowrap")}>Open the app</Link>
          ) : (
            <>
              <span className="hidden sm:block">
                <a href={SIGN_IN_HREF} className={buttonClasses("ghost", "sm", "whitespace-nowrap")}>Sign in</a>
              </span>
              <a href={SIGN_UP_HREF} className={buttonClasses("primary", "sm", "whitespace-nowrap")}>Get started</a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
