import { buttonClasses } from "@/components/ui";
import { DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo";
import { SIGN_IN_HREF } from "../lib/links";
import { Section } from "./Section";

const ACCOUNTS = [
  { user: "sam", role: "Shopper: mandates, AI shopping, purchases" },
  { user: "ada", role: "Seller: Ada's Provisions' orders and catalog" },
  { user: "morgan", role: "Support: blocked carts and disputes" },
  { user: "olivia", role: "Ops / LLM engineer: traces, evaluations, test marketplace" },
  { user: "kemi", role: "Admin: seller verification" },
];

/** Only shown in sandbox builds (NEXT_PUBLIC_DEMO_MODE). */
export function SandboxInvite() {
  if (!DEMO_MODE) return null;
  return (
    <Section
      id="try"
      eyebrow="Try it now"
      title="Explore the sandbox with ready-made accounts."
      intro="Test money, test sellers, and some sellers who are deliberately dishonest."
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
          <h3 className="font-display text-xl font-semibold">Walk through the toner example</h3>
          <p className="text-ink-2">
            Sign in as <b>sam</b>. One cart was blocked because the account belonged to someone else; another passed every check and is
            waiting for approval. Or create a new mandate and watch the AI shop.
          </p>
          <a href={SIGN_IN_HREF} className={buttonClasses("primary", "md", "self-start")}>Sign in</a>
        </div>
      </div>
    </Section>
  );
}
