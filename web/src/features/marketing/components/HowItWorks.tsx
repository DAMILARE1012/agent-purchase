import { Section } from "./Section";

const STEPS = [
  { title: "Pay", text: "Send money in Scan-to-Confirm. A signed receipt is created with the payment, instantly." },
  { title: "Share the receipt", text: "Send the receipt link, its QR code or the image, in any chat app. No more screenshots." },
  { title: "Scan", text: "They point any phone camera at the QR, or open the link. No app to install." },
  { title: "Confirm", text: "They see the live status from our ledger and tap “I received it”. You're notified." },
];

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="Four steps, and nobody has to take anyone's word for it.">
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
            <span className="grid size-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-canvas">{i + 1}</span>
            <h3 className="font-display text-xl font-semibold">{s.title}</h3>
            <p className="text-ink-2">{s.text}</p>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="absolute top-11 -right-3 hidden text-line-strong lg:block">→</span>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
