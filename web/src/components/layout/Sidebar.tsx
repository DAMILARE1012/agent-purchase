"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Badge, Button, Icon } from "@/components/ui";
import { signIn, useViewer } from "@/features/session";
import { cn } from "@/lib/cn";
import { DEMO_MODE } from "@/lib/demo";
import { isActive, navFor } from "./navigation";

const ROLE_LABEL: Record<string, string> = {
  member: "Personal",
  merchant: "Business",
  analyst: "Risk analyst",
  ops: "Platform finance",
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, isSignedIn, hasWallet, isLoading } = useViewer();
  const sections = navFor(user?.role, hasWallet);

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex h-16 items-center gap-2 border-b border-line px-5 font-display text-lg font-bold">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-ink text-sm text-canvas">✓</span>
        Scan-to-Confirm
      </Link>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{section.title}</p>
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2/60 hover:text-ink",
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute top-2 bottom-2 -left-3 w-1 rounded-r bg-truth" />}
                  <Icon name={item.icon} className={cn("size-[18px]", active ? "text-truth" : "")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-line p-4">
        {DEMO_MODE && (
          <p className="rounded-lg bg-ai-bg px-3 py-2 text-xs text-ink-2">
            <span className="font-semibold text-ai">Sandbox.</span> Balances are test money.
          </p>
        )}
        {isLoading ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
        ) : isSignedIn && user ? (
          <div className="flex items-center gap-3">
            <Avatar name={user.displayName} seed={user.id} />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{user.displayName}</span>
              <span className="truncate text-xs text-muted">{user.handle}</span>
            </div>
            <form method="post" action="/auth/logout">
              <button type="submit" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label="Sign out" title="Sign out">
                <Icon name="logout" className="size-[18px]" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => signIn()}>Sign in</Button>
            <Button size="sm" variant="secondary" onClick={() => signIn({ register: true, returnTo: "/wallet" })}>Create account</Button>
          </div>
        )}
        {isSignedIn && user && ROLE_LABEL[user.role] && (
          <Badge tone={user.role === "analyst" || user.role === "ops" ? "crypto" : "neutral"} className="self-start">
            {ROLE_LABEL[user.role]}
          </Badge>
        )}
      </div>
    </div>
  );
}
