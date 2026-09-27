"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { homeFor } from "@/components/layout/navigation";
import { useViewer } from "@/features/session";
import { SIGN_IN_HREF, SIGN_UP_HREF } from "../lib/links";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#protection", label: "Protection" },
  { href: "#who", label: "Who it's for" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingHeader() {
  const { user, isSignedIn, isLoading } = useViewer();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold whitespace-nowrap">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-ink text-sm text-canvas">✓</span>
          Scan-to-Confirm
        </Link>
        <nav aria-label="Page sections" className="hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {isLoading ? (
            <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
          ) : isSignedIn ? (
            <Link href={homeFor(user?.role)} className={buttonClasses("primary", "sm", "whitespace-nowrap")}>
              Open the app
            </Link>
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
