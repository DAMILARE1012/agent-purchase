import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AttentionItem } from "../lib/insights";

const TONE: Record<AttentionItem["tone"], { icon: IconName; className: string }> = {
  truth: { icon: "check", className: "bg-truth-bg text-truth" },
  ai: { icon: "clock", className: "bg-ai-bg text-ai" },
  bad: { icon: "alert", className: "bg-bad-bg text-bad" },
};

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">Needs your attention</h2>
        {items.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{items.length}</span>}
      </header>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-truth-bg text-truth"><Icon name="check" /></span>
          <p className="font-semibold">You&apos;re all caught up</p>
          <p className="text-sm text-muted">Payments to confirm or review will show here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const tone = TONE[item.tone];
            return (
              <li key={`${item.id}-${item.tone}`}>
                <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone.className)}>
                    <Icon name={tone.icon} className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{item.title}</span>
                    <span className="truncate text-xs text-muted">{item.detail}</span>
                  </span>
                  <span className="text-xs font-semibold text-crypto">{item.action}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
