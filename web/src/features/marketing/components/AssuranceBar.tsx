import { Icon, type IconName } from "@/components/ui/Icon";

const FACTS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "shield", title: "9 checks before any naira moves", text: "Plain code outside the AI. Nothing a seller writes can change it." },
  { icon: "refresh", title: "Checked twice", text: "When the AI proposes the cart, and again at the moment of payment." },
  { icon: "bank", title: "Bank-confirmed payee", text: "The account's owner must be the seller, by the bank's own name check." },
  { icon: "receipt", title: "One payment per cart", text: "Double clicks, retries and two open tabs can never pay twice." },
];

/** What's always true, in four lines, right under the promise. */
export function AssuranceBar() {
  return (
    <section aria-label="What's always true" className="border-y border-line bg-surface-2 px-4">
      <ul className="mx-auto grid max-w-6xl gap-px sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((f) => (
          <li key={f.title} className="flex gap-3 py-7 sm:px-4 lg:first:pl-0">
            <Icon name={f.icon} className="mt-0.5 size-5 shrink-0 text-truth" />
            <div>
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-ink-2">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
