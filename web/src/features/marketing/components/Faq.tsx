import { Section } from "./Section";

const QUESTIONS = [
  {
    q: "Does the person I pay need to install anything?",
    a: "No. The receipt's QR code is a link, so any phone camera opens the check in the browser. They can also paste the link or upload the image.",
  },
  {
    q: "What if someone edits the receipt image?",
    a: "The amount inside the QR code is digitally signed, so it can't be changed. When an image is uploaded, we compare the printed amount with the signed one and look for signs of editing. Either way, you see the real amount from our ledger.",
  },
  {
    q: "Can the same receipt be used twice?",
    a: "Once the payee confirms “I received it”, any later scan says it was already confirmed and when. If they only checked it before, they're warned that it isn't a new payment.",
  },
  {
    q: "What happens if a payment is reversed after I've confirmed it?",
    a: "Both of you are notified straight away, and any later scan shows it as reversed. If you had refunded part of it through Refund, you only lose what you still hold.",
  },
  {
    q: "What does someone who isn't signed in see?",
    a: "Whether the receipt is genuine, plus its amount, date and live status. Names and account details are only shown to the two people involved.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. Scan-to-Confirm is running as a sandbox: new accounts get a test balance, and payments move between test wallets only.",
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
