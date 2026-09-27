import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionProps {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A landing-page section: eyebrow, headline, optional intro, content. */
export function Section({ id, eyebrow, title, intro, children, className }: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 sm:py-24", className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <header className="flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-truth">{eyebrow}</p>
          <h2 className="font-display text-3xl font-bold text-balance sm:text-4xl">{title}</h2>
          {intro && <p className="text-lg text-ink-2">{intro}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
