import { buttonClasses } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { VERIFY_HREF } from "../lib/links";

const RECEIPT_CHECKS: Array<[string, string]> = [
  ["Platform signature", "Signed with key rk-2026-09"],
  ["Shopper approved this cart", "Their passkey signed this exact cart"],
  ["Seller's cart", "Signed by Ikeja Office Hub with its registered key"],
  ["Gate decision", "Allowed at the moment of payment"],
  ["Bank payment", "Paid; bank session ID 2609271855…"],
];

const POINTS = [
  "Paid straight into your own verified bank account",
  "Carts you sign with your key, so nobody can change your prices",
  "A receipt for every order that anyone can check, no account needed",
];

/** Sellers: the other half of the market, and the end of fake transfer screenshots. */
export function Audience() {
  return (
    <section id="sellers" className="scroll-mt-16 px-4 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <p className="text-sm font-semibold text-truth">For sellers</p>
          <h2 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-[2.6rem]">
            Get paid by AI shoppers, with proof you can check before you ship.
          </h2>
          <p className="text-lg leading-relaxed text-ink-2">
            No more fake transfer screenshots. Every order comes with a signed receipt: scan it, and you see whether the shopper authorised it
            and whether the bank paid.
          </p>
          <ul className="flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-truth-bg text-truth"><Icon name="check" className="size-3.5" /></span>
                {p}
              </li>
            ))}
          </ul>
          <a href={VERIFY_HREF} className={buttonClasses("secondary", "md", "h-11 self-start px-5")}>
            <Icon name="qr" className="size-4" /> Verify a receipt
          </a>
        </div>

        <div className="rounded-2xl border border-line bg-white shadow-[0_20px_50px_-24px_rgb(11_18_32/0.25)]" role="img"
          aria-label="A verified receipt: every check passes">
          <div className="flex items-center gap-4 rounded-t-2xl border-b border-truth/30 bg-truth-bg px-6 py-5">
            <span className="grid size-10 place-items-center rounded-full bg-white text-truth"><Icon name="check" /></span>
            <div>
              <p className="text-xs font-semibold tracking-wide text-truth uppercase">Genuine</p>
              <p className="font-display text-lg font-semibold">Authorised and paid</p>
            </div>
            <p className="ml-auto font-display text-xl font-bold tabular-nums">₦38,500</p>
          </div>
          <ul className="divide-y divide-line px-6">
            {RECEIPT_CHECKS.map(([label, detail]) => (
              <li key={label} className="flex items-start gap-3 py-3.5">
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-truth" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-sm text-ink-2">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
