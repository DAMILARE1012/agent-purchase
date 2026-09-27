import { buttonClasses } from "@/components/ui";
import { SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";

export function FinalCta() {
  return (
    <section className="px-4 py-20 sm:py-24">
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 overflow-hidden rounded-3xl border border-truth/40 bg-truth-bg px-6 py-14 text-center">
        <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <h2 className="relative font-display text-3xl font-bold text-balance sm:text-5xl">Make every payment provable.</h2>
        <p className="relative max-w-xl text-lg text-ink-2">
          Pay, share the receipt, and let the ledger do the talking. It takes a minute to set up.
        </p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <a href={SIGN_UP_HREF} className={buttonClasses("primary", "md", "h-12 px-6 text-base")}>Create a free account</a>
          <a href={VERIFY_HREF} className={buttonClasses("secondary", "md", "h-12 px-6 text-base")}>Check a receipt</a>
        </div>
      </div>
    </section>
  );
}
