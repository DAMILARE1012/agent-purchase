import { buttonClasses } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { SIGN_UP_HREF } from "../lib/links";
import { HeroVisual } from "./HeroVisual";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4">
      <div aria-hidden="true" className="bg-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_65%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-20 pt-12 pb-28 sm:pt-16 lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:pt-20 lg:pb-32">
        <div className="flex flex-col gap-7">
          <p className="flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm font-semibold text-ink-2 shadow-sm">
            <span className="size-1.5 rounded-full bg-truth" /> Safe payments for AI shopping
          </p>
          <h1 className="font-display text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-[3.25rem] xl:text-[3.6rem]">
            Let AI do the shopping. <span className="text-truth">You keep the last word on every naira.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            Say what you need and sign the exact limits. The AI finds the best cart; a gate outside the AI checks it against your limits and asks
            the bank who owns the account, before any transfer is made.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={SIGN_UP_HREF} className={buttonClasses("primary", "md", "h-12 px-6 text-base")}>
              Start shopping safely <Icon name="send" className="size-4" />
            </a>
            <a href="#how" className={buttonClasses("secondary", "md", "h-12 px-6 text-base")}>See how it works</a>
          </div>
          <p className="text-sm text-muted">Free in the sandbox: test money, test banks and a marketplace with some deliberately dishonest sellers.</p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
