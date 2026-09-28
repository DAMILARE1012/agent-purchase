import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

const SIGN = (
  <>
    <div className="divide-y divide-line">
      <Row label="Item" value="HP 107A toner" />
      <Row label="Maximum" value="₦40,000 incl. delivery" />
      <Row label="Sellers" value="Verified only" />
      <Row label="Deliver by" value="Fri 2 Oct, Lagos" />
    </div>
    <p className="mt-3 flex items-center gap-1.5 rounded-md bg-crypto-bg px-2.5 py-1.5 text-xs font-semibold text-crypto">
      <Icon name="key" className="size-3.5" /> Signed with your passkey
    </p>
  </>
);

const SHOP_STEPS: Array<[IconName, string]> = [
  ["search", "Searched for “HP 107A toner”: 6 listings, 3 photo catalogs"],
  ["receipt", "Read a price-list photo from PrintPoint"],
  ["cart", "Asked Ikeja Office Hub for a signed cart: ₦38,500"],
  ["bot", "Proposed the cart"],
];

const SHOP = (
  <ol className="flex flex-col gap-2.5 text-xs">
    {SHOP_STEPS.map(([icon, text]) => (
      <li key={text} className="flex items-start gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon name={icon} className="size-3" />
        </span>
        <span className="text-ink-2">{text}</span>
      </li>
    ))}
  </ol>
);

const PAY = (
  <>
    <ul className="flex flex-col gap-1.5 text-xs">
      {["Mandate valid, uses left", "Signed by the seller", "₦38,500 of ₦40,000", "It's HP 107A", "Bank: IKEJA OFFICE HUB LTD"].map((t) => (
        <li key={t} className="flex items-center gap-2">
          <Icon name="check" className="size-3.5 text-truth" /> {t}
        </li>
      ))}
    </ul>
    <p className="mt-3 rounded-md bg-ink px-3 py-2 text-center text-xs font-semibold text-white">Approve ₦38,500 with your passkey</p>
  </>
);

const STEPS: Array<{ title: string; text: string; snippet: ReactNode }> = [
  {
    title: "Say it, then sign the exact limits",
    text: "Write what you need in a sentence. The AI drafts the limits; you check every value and sign them with your passkey. Anything you didn't say is set to the strictest option.",
    snippet: SIGN,
  },
  {
    title: "The AI shops, and you can watch",
    text: "It searches sellers, reads catalogs (even photos of flyers and handwritten price lists) and asks sellers for signed carts. It can suggest; it can't pay.",
    snippet: SHOP,
  },
  {
    title: "The gate checks. You approve. The bank pays.",
    text: "The cart is checked against your mandate and the bank's name check. You approve the exact cart, it's checked again, and a signed receipt is issued.",
    snippet: PAY,
  },
];

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="The AI suggests. Your mandate decides." className="bg-surface-2">
      <ol className="grid gap-6 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex flex-col gap-3 p-7">
              <span className="font-mono text-sm font-semibold text-truth">Step {i + 1}</span>
              <h3 className="font-display text-xl leading-snug font-semibold">{s.title}</h3>
              <p className="text-ink-2">{s.text}</p>
            </div>
            <div className="mt-auto border-t border-line bg-surface-2/60 p-5">
              <div className="rounded-xl border border-line bg-white p-4 shadow-sm">{s.snippet}</div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
