import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

/** The gate's rules, as the shopper would say them (services/api/app/services/gate.py). */
const CHECKS = [
  ["Your mandate is signed, not expired, not cancelled, with uses left", "Mandate"],
  ["The seller signed this exact cart with their registered key", "Cart"],
  ["The seller is one your mandate allows", "Seller"],
  ["The prices add up, delivery included", "Arithmetic"],
  ["The total is within your limit", "Limit"],
  ["It's the item you asked for: brand, model, quantity", "Item"],
  ["It arrives before your deadline", "Delivery"],
  ["The account is the seller's own, by the bank's name check", "Payee"],
  ["It keeps you within your weekly or monthly cap", "Cap"],
];

const PRINCIPLES: Array<{ icon: IconName; title: string; text: ReactNode }> = [
  { icon: "shield", title: "Rules outside the AI", text: "Ordinary, versioned code that reads only your signed mandate, the seller's signed cart and the bank's answer." },
  { icon: "key", title: "You sign exact values", text: "Your passkey signs the actual numbers and names you saw, never an AI summary. Nobody, us included, can widen them." },
  { icon: "lock", title: "Checked at the moment of payment", text: "The mandate is locked while the gate runs again, so a cancelled mandate or a used-up cap can't slip through." },
  {
    icon: "signature",
    title: "Every purchase is provable",
    text: (
      <>
        Receipts are signed (Ed25519) and bind your mandate, the cart and the bank reference. Keys:{" "}
        <a href="/.well-known/receipt-keys.json" className="font-mono text-sm text-truth underline underline-offset-2">receipt-keys.json</a>
      </>
    ),
  },
];

export function SecuritySection() {
  return (
    <Section
      id="gate"
      eyebrow="The gate"
      title="Nine checks stand between the AI and your money."
      intro="The AI can be fooled; we measure how often. What must never happen is money moving outside what you signed. That's the gate's only job."
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <ul className="flex flex-col gap-7">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink"><Icon name={p.icon} /></span>
              <div>
                <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-1 text-ink-2">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl border border-line bg-white shadow-[0_20px_50px_-24px_rgb(11_18_32/0.25)]">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <p className="font-display font-semibold">Before any transfer</p>
            <span className="rounded-full bg-truth-bg px-2.5 py-1 text-xs font-semibold text-truth">All must pass</span>
          </div>
          <ol className="divide-y divide-line">
            {CHECKS.map(([text, tag], i) => (
              <li key={tag} className="flex items-center gap-4 px-6 py-3.5">
                <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                <span className="flex-1 text-[15px]">{text}</span>
                <Icon name="check" className="size-4 shrink-0 text-truth" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
