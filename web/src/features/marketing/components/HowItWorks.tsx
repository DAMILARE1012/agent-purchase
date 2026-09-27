import { Section } from "./Section";

const STEPS = [
  { title: "Set the rules", text: "Say what you need in a sentence. Check the exact limits (item, budget, sellers, deadline) and sign them with your passkey." },
  { title: "The AI shops", text: "It searches sellers, reads their catalogs (even photos of flyers and price lists) and proposes the best cart. It can't pay." },
  { title: "The gate checks", text: "Plain code, outside the AI, compares the cart with your mandate and asks the bank who owns the account being paid." },
  { title: "You approve", text: "You see the exact cart beside your limits and approve with your passkey. The gate checks again at the moment of payment." },
  { title: "Proof for both sides", text: "A signed receipt shows what you allowed, what was bought and the bank's reference. The seller can verify it." },
];

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="The AI suggests. Your mandate decides.">
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
            <span className="grid size-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-canvas">{i + 1}</span>
            <h3 className="font-display text-xl font-semibold">{s.title}</h3>
            <p className="text-ink-2">{s.text}</p>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute top-11 -right-3 hidden text-line-strong lg:block">→</span>}
          </li>
        ))}
      </ol>
    </Section>
  );
}
