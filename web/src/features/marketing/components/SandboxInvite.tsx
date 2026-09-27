import { buttonClasses } from "@/components/ui";
import { DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo";
import { SIGN_IN_HREF, VERIFY_HREF } from "../lib/links";
import { Section } from "./Section";

const ACCOUNTS = [
  { user: "sam", role: "Sends money and shares receipts" },
  { user: "rita", role: "Receives money and checks receipts" },
  { user: "ada", role: "A small business taking payments" },
  { user: "morgan", role: "Risk analyst: reviews flagged payments" },
  { user: "olivia", role: "Platform finance: sees the full ledger" },
];

/** Only shown in sandbox builds (NEXT_PUBLIC_DEMO_MODE). */
export function SandboxInvite() {
  if (!DEMO_MODE) return null;
  return (
    <Section
      id="try"
      eyebrow="Try it now"
      title="Explore the sandbox with ready-made accounts."
      intro="Open two browsers, sign in as the payer in one and the payee in the other, and watch a payment move."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Username</th>
                <th className="px-5 py-3 font-semibold">What you&apos;ll see</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ACCOUNTS.map((a) => (
                <tr key={a.user}>
                  <td className="px-5 py-3 font-mono font-semibold">{a.user}</td>
                  <td className="px-5 py-3 text-ink-2">{a.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {DEMO_PASSWORD && (
            <p className="border-t border-line px-5 py-3 text-sm text-ink-2">
              Password for every demo account: <span className="font-mono font-semibold text-ink">{DEMO_PASSWORD}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-truth/40 bg-truth-bg p-6">
          <h3 className="font-display text-xl font-semibold">Or go straight to the fraud scenarios</h3>
          <p className="text-ink-2">
            The verify page has one-click scenarios for forged, edited, recycled, reversed and pending receipts, each
            checked as the person it was shown to.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={VERIFY_HREF} className={buttonClasses("primary")}>Open the scenarios</a>
            <a href={SIGN_IN_HREF} className={buttonClasses("secondary")}>Sign in</a>
          </div>
        </div>
      </div>
    </Section>
  );
}
