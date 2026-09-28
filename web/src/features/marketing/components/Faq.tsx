import { Section } from "./Section";

const QUESTIONS = [
  {
    q: "Can the AI spend more than I allow?",
    a: "No. The AI can only suggest a cart. Every payment goes through the gate, which checks the cart against the limits you signed at the moment of payment, and you approve it with your passkey.",
  },
  {
    q: "What if a seller tricks the AI?",
    a: "It can happen, and we measure how often. But a trick only changes what the AI suggests. The gate still refuses a cart that breaks your mandate or pays an account that isn't the seller's.",
  },
  {
    q: "Which AI does the shopping?",
    a: "Qwen (qwen3.8-27b) on Groq. It understands your request, decides what to look at next, and reads catalogs that exist only as photos, like flyers and price lists.",
  },
  {
    q: "Why a passkey?",
    a: "So nobody, including us, can create or widen a mandate or approve a payment for you. Your passkey signs the exact values you saw, on your own device.",
  },
  {
    q: "What does the seller get?",
    a: "The money in their own verified bank account, and a signed receipt proving you authorised the purchase. Anyone can check it on the verify page, no account needed.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. Mandate Gate runs as a sandbox with test money, test banks and test sellers. A real launch needs a licensed payment partner.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions">
      <div className="grid gap-x-12 lg:grid-cols-2">
        {[QUESTIONS.slice(0, 3), QUESTIONS.slice(3)].map((column, i) => (
          <div key={i} className="divide-y divide-line border-y border-line">
            {column.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden="true" className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-line text-sm text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pr-10 leading-relaxed text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}
