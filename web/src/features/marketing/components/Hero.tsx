import { buttonClasses } from "@/components/ui";
import { SIGN_UP_HREF, VERIFY_HREF } from "../lib/links";
import { HeroVisual } from "./HeroVisual";
import { Icon } from "@/components/ui/Icon";

const PROOF_POINTS = ["Every receipt is cryptographically signed", "Status comes live from the ledger", "Anyone can verify, no app needed"];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line px-4">
      <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div className="flex flex-col gap-7">
          <p className="w-fit rounded-full border border-truth/40 bg-truth-bg px-3 py-1 font-mono text-xs font-semibold tracking-wide text-truth">
            Verifiable receipts for everyday payments
          </p>
          <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Don&apos;t trust the screenshot.
            <br />
            <span className="text-truth">Scan the receipt.</span>
          </h1>
          <p className="max-w-xl text-lg text-ink-2 sm:text-xl">
            Every payment on Scan-to-Confirm comes with a signed QR receipt. Whoever scans it sees the real payment,
            live from our ledger, so fake, edited and recycled receipts are caught before you hand anything over.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={SIGN_UP_HREF} className={buttonClasses("primary", "md", "h-12 px-6 text-base")}>Create a free account</a>
            <a href={VERIFY_HREF} className={buttonClasses("secondary", "md", "h-12 px-6 text-base")}>Check a receipt</a>
          </div>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {PROOF_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-ink-2">
                <Icon name="check" className="size-4 text-truth" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
