import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

const THREATS: Array<{ icon: IconName; title: string; trick: string; defence: string }> = [
  {
    icon: "forged",
    title: "Forged receipts",
    trick: "A fake “payment successful” screen for money that never moved.",
    defence: "The receipt's digital signature fails. Only the platform can sign a receipt.",
  },
  {
    icon: "edited",
    title: "Edited amounts",
    trick: "A real receipt for $25, changed to say $250.",
    defence: "We compare the printed amount with the signed one, and an AI model looks for edited pixels.",
  },
  {
    icon: "recycled",
    title: "Recycled receipts",
    trick: "Last week's genuine receipt, shown again as a new payment.",
    defence: "You're told when it was already confirmed or checked, and how old it is.",
  },
  {
    icon: "reversed",
    title: "Reversed payments",
    trick: "Real money from a stolen account that gets pulled back later.",
    defence: "Every scan shows the live status, risky payments are held, and you're alerted if it's reversed.",
  },
  {
    icon: "overpay",
    title: "Overpayment scams",
    trick: "“I sent you too much by mistake. Please send back the difference.”",
    defence: "You always see the real amount, and refunds are tied to the original payment so a reversal can't cost you twice.",
  },
  {
    icon: "person",
    title: "Someone else's receipt",
    trick: "A genuine receipt for a payment made to another person.",
    defence: "We tell you straight away that it wasn't paid to you.",
  },
];

export function ProtectionGrid() {
  return (
    <Section
      id="protection"
      eyebrow="What it catches"
      title="The six receipt tricks, and how each one fails."
      intro="Scanning checks the payment itself on our ledger, not the picture. Here's what that stops."
      className="border-y border-line bg-surface"
    >
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {THREATS.map((t) => (
          <li key={t.title} className="flex flex-col gap-4 rounded-xl border border-line bg-canvas p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-bad-bg text-bad"><Icon name={t.icon} /></span>
              <h3 className="font-display text-lg font-semibold">{t.title}</h3>
            </div>
            <p className="text-ink-2 italic">{t.trick}</p>
            <p className="mt-auto flex gap-2 border-t border-line pt-4 text-sm">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-truth" />
              <span>{t.defence}</span>
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
