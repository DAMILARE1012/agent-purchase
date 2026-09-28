import { Section } from "./Section";

/**
 * Results from the project's own tests (services/api/tests, services/api/evals/reports).
 * Update them when the tests are re-run; never round them up.
 */
const RESULTS = [
  { value: "5 of 50", title: "approvals paid, as allowed", text: "50 approvals fired at the same moment against a mandate allowing 5 purchases. Exactly 5 were paid; 45 were refused, with reasons." },
  { value: "1,300", title: "rule-breaking carts, all refused", text: "Generated carts that break one or several rules (over budget, wrong item, wrong account, too late) or were altered after the seller signed them. Every one refused; 400 honest carts all allowed." },
  { value: "0 of 24", title: "drafts broader than the request", text: "Sentences like “₦5,000 each time, at most ₦10,000 a month”. No drafted mandate allowed more than the shopper wrote." },
  { value: "100%", title: "of prices read from photos", text: "13 flyers and price lists that exist only as pictures: every item found, every price right, nothing invented, and hidden instructions reported." },
];

export function Evidence() {
  return (
    <Section
      id="evidence"
      eyebrow="Evidence"
      title="Measured, not promised."
      intro="Every version of the AI runs the same tests on the real model before it can ship. A version that gets worse is blocked automatically."
    >
      <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {RESULTS.map((r) => (
          <li key={r.title} className="flex flex-col gap-2 bg-white p-7">
            <p className="font-display text-4xl font-bold tracking-tight tabular-nums">{r.value}</p>
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm leading-relaxed text-ink-2">{r.text}</p>
          </li>
        ))}
      </ul>
      <p className="-mt-6 text-sm text-muted">Sandbox results, September 2026: qwen/qwen3.8-27b on Groq, test money and test sellers.</p>
    </Section>
  );
}
