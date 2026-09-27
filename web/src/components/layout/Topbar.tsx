"use client";

import { usePathname } from "next/navigation";
import { ButtonLink, Icon } from "@/components/ui";
import { useViewer } from "@/features/session";
import { titleFor } from "./navigation";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { hasWallet } = useViewer();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
      >
        <Icon name="menu" />
      </button>
      <p className="truncate font-semibold">{titleFor(pathname)}</p>
      <div className="ml-auto flex items-center gap-2">
        {pathname !== "/r" && (
          <ButtonLink href="/r" variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Icon name="qr" className="size-4" /> Verify
          </ButtonLink>
        )}
        {hasWallet && pathname !== "/send" && (
          <ButtonLink href="/send" size="sm">
            <Icon name="send" className="size-4" /> Send money
          </ButtonLink>
        )}
      </div>
    </header>
  );
}
