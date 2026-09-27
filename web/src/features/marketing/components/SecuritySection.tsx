import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

const PRINCIPLES: Array<{ icon: IconName; title: string; text: React.ReactNode }> = [
  {
    icon: "signature",
    title: "Signed at the source",
    text: (
      <>
        Every receipt carries an Ed25519 digital signature. Our public keys are published at{" "}
        <a href="/.well-known/receipt-keys.json" className="font-mono text-sm text-[#86efc0] underline underline-offset-2">
          /.well-known/receipt-keys.json
        </a>{" "}
        so anyone can check a receipt independently.
      </>
    ),
  },
  {
    icon: "ledger",
    title: "The ledger is the source of truth",
    text: "Money moves through a double-entry ledger where entries can never be edited or deleted. A scan always shows the payment's current status, not what it was when the screenshot was taken.",
  },
  {
    icon: "spark",
    title: "AI adds caution, never removes it",
    text: "Models look for edited images, risky payments and forgery campaigns. They can flag or hold a payment, but they can never turn a failed check into a pass. People make the final call on accounts.",
  },
  {
    icon: "lock",
    title: "Private by design",
    text: "The QR code holds no names or account numbers. Only the two people involved see the details. Your sign-in tokens stay on our servers, never in your browser.",
  },
];

/** A deliberately fixed deep-green band: it looks the same in light and dark themes. */
export function SecuritySection() {
  return (
    <Section
      id="security"
      eyebrow="Security"
      title="Built so the answer can't be faked."
      intro="The checks that decide whether money moved are deterministic. AI helps catch what those checks can't see."
      className="border-y border-line bg-[#0c2119] text-white [&_h2]:text-white [&_header_p:first-child]:text-[#86efc0] [&_header_p:last-child]:text-white/75"
    >
      <ul className="grid gap-4 md:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <li key={p.title} className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#86efc0]/15 text-[#86efc0]">
              <Icon name={p.icon} />
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-lg font-semibold text-white">{p.title}</h3>
              <p className="text-white/75">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
