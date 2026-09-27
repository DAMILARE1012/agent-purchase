import { Section } from "./Section";

const QUESTIONS = [
  {
    q: "Can the AI spend more than I allow?",
    a: "No. Every payment goes through the gate, which checks the cart against the limits you signed, at the moment of payment. The AI has no way to pay on its own.",
  },
  {
    q: "What if a seller tricks the AI?",
    a: "It can happen, and we measure how often. But the trick only changes what the AI suggests. The gate still refuses a cart that breaks your mandate or pays an account that isn't the seller's.",
  },
  {
    q: "Which AI does the shopping?",
    a: "Qwen (qwen3.8-27b) running on Groq. It understands your request, decides what to look at next, and reads catalogs that are only photos, like flyers and handwritten price lists.",
  },
  {
    q: "Why do I sign with a passkey?",
    a: "So nobody, including us, can create or widen a mandate for you. The passkey signs a hash of the exact limits you saw.",
  },
  {
    q: "What does the seller get?",
    a: "The money in their own bank account, and a signed receipt proving you authorised the purchase. They can check it on the verify page without an account.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. Mandate Gate runs as a sandbox with test money, test banks and test sellers. A real launch needs a licensed payment partner.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions" className="border-t border-line bg-surface">
      <div className="grid gap-3 lg:grid-cols-2">
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} className="group rounded-xl border border-line bg-canvas p-5 open:border-line-strong">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden="true" className="mt-0.5 font-mono text-muted transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-ink-2">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
