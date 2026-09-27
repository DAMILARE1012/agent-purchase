import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

const PRINCIPLES: Array<{ icon: IconName; title: string; text: React.ReactNode }> = [
  {
    icon: "shield",
    title: "Rules outside the AI",
    text: "The gate is ordinary, versioned code. It reads only your signed mandate, the seller's signed cart and the bank's answer, so nothing a seller writes can change its decision.",
  },
  {
    icon: "key",
    title: "You sign exact values",
    text: "You approve the actual numbers and names, never an AI-written summary. Your passkey signs a hash of them, and anything the AI couldn't pin down defaults to the strictest option.",
  },
  {
    icon: "bank",
    title: "Money only to the seller's own account",
    text: "Before paying, the bank is asked who owns the account. If the name doesn't match the seller's registered legal name, nothing is paid.",
  },
  {
    icon: "signature",
    title: "Every purchase is provable",
    text: (
      <>
        Receipts are signed with Ed25519 and bind your mandate, the cart and the bank reference together. Public keys are at{" "}
        <a href="/.well-known/receipt-keys.json" className="font-mono text-sm text-[#86efc0] underline underline-offset-2">
          /.well-known/receipt-keys.json
        </a>
        .
      </>
    ),
  },
];

/** A deliberately fixed deep-green band: it looks the same in light and dark themes. */
export function SecuritySection() {
  return (
    <Section
      id="security"
      eyebrow="Security"
      title="Built so a fooled AI still can't spend your money."
      intro="We test the AI against a marketplace of dishonest sellers and publish how often it's fooled. The number that must stay at zero is how often money moved wrongly."
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
