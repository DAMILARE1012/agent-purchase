"use client";

import { usePathname } from "next/navigation";
import { ButtonLink, Icon } from "@/components/ui";
import { useViewer } from "@/features/session";
import { titleFor } from "./navigation";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { user } = useViewer();

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
        {user?.role === "shopper" && pathname !== "/shop/mandates/new" && (
          <ButtonLink href="/shop/mandates/new" size="sm">
            <Icon name="mandate" className="size-4" /> New mandate
          </ButtonLink>
        )}
      </div>
    </header>
  );
}
