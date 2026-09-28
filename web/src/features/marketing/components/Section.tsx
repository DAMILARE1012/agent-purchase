import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionProps {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Centre the heading (for sections whose content is symmetric). */
  centered?: boolean;
}

/** A landing-page section: eyebrow, headline, optional intro, content. */
export function Section({ id, eyebrow, title, intro, children, className, centered }: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-16 px-4 py-20 sm:py-28", className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-12 sm:gap-14">
        <header className={cn("flex max-w-2xl flex-col gap-4", centered && "mx-auto items-center text-center")}>
          <p className="text-sm font-semibold text-truth">{eyebrow}</p>
          <h2 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-[2.6rem]">{title}</h2>
          {intro && <p className="text-lg leading-relaxed text-ink-2">{intro}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
