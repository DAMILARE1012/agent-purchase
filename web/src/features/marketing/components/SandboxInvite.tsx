import { buttonClasses } from "@/components/ui";
import { DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo";
import { SIGN_IN_HREF } from "../lib/links";
import { Section } from "./Section";

const ACCOUNTS = [
  { user: "sam", role: "Shopper", sees: "Mandates, AI shopping, purchases and receipts" },
  { user: "ada", role: "Seller", sees: "Ada's Provisions: orders, catalog, bank accounts" },
  { user: "morgan", role: "Support", sees: "Carts the gate blocked, disputes" },
  { user: "olivia", role: "Ops", sees: "Run traces, evaluations, model limits" },
  { user: "kemi", role: "Admin", sees: "Seller verification" },
];

/** Only shown in sandbox builds (NEXT_PUBLIC_DEMO_MODE). */
export function SandboxInvite() {
  if (!DEMO_MODE) return null;
  return (
    <Section
      id="try"
      eyebrow="Try it now"
      title="A working sandbox, with ready-made accounts."
      intro="Test money, four test banks, and a marketplace where some sellers are deliberately dishonest. Nothing real is paid."
      className="border-t border-line bg-surface-2"
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Sign in as</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="hidden px-5 py-3 font-semibold sm:table-cell">What you&apos;ll see</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ACCOUNTS.map((a) => (
                <tr key={a.user}>
                  <td className="px-5 py-3.5 font-mono font-semibold">{a.user}</td>
                  <td className="px-5 py-3.5">{a.role}</td>
                  <td className="hidden px-5 py-3.5 text-ink-2 sm:table-cell">{a.sees}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {DEMO_PASSWORD && (
            <p className="border-t border-line bg-surface-2/60 px-5 py-3 text-sm text-ink-2">
              Password for every account: <span className="font-mono font-semibold text-ink">{DEMO_PASSWORD}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-7">
          <h3 className="font-display text-xl font-semibold">Start with the toner example</h3>
          <p className="text-ink-2">
            Sign in as <b>sam</b> and ask for HP 107A toner under ₦40,000. Watch the AI shop live, see which sellers the gate refuses and why,
            then approve the honest cart with a passkey.
          </p>
          <a href={SIGN_IN_HREF} className={buttonClasses("primary", "md", "h-11 self-start px-5")}>Open the sandbox</a>
        </div>
      </div>
    </Section>
  );
}
