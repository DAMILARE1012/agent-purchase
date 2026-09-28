import { buttonClasses } from "@/components/ui";
import { SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";

export function FinalCta() {
  return (
    <section className="px-4 pb-24">
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-hidden rounded-3xl border border-line bg-white px-6 py-16 text-center shadow-[0_24px_60px_-30px_rgb(11_18_32/0.3)] sm:py-20">
        <div aria-hidden="true" className="bg-grid absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div aria-hidden="true" className="absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-truth-bg blur-3xl" />
        <h2 className="relative max-w-2xl font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          Let AI shop. Keep the last word.
        </h2>
        <p className="relative max-w-xl text-lg text-ink-2">
          Sign your first mandate in a minute. The AI does the searching; your limits and the bank decide what gets paid.
        </p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <a href={SIGN_UP_HREF} className={buttonClasses("primary", "md", "h-12 px-6 text-base")}>Create a free account</a>
          <a href={VERIFY_HREF} className={buttonClasses("secondary", "md", "h-12 px-6 text-base")}>Verify a receipt</a>
        </div>
      </div>
    </section>
  );
}
