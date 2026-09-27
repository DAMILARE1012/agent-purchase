import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

const AUDIENCES: Array<{ icon: IconName; title: string; text: string; points: string[] }> = [
  {
    icon: "person",
    title: "Friends and family",
    text: "Split the bill, pay back a loan, chip in for a gift.",
    points: ["Know it arrived without asking twice", "A shared record both of you can see"],
  },
  {
    icon: "shop",
    title: "Sellers and small shops",
    text: "Hand over goods only when the money is real.",
    points: ["Scan at the counter in seconds", "Refunds that protect you from reversal scams"],
  },
  {
    icon: "ledger",
    title: "Landlords, tutors and freelancers",
    text: "Get paid by people you don't know well.",
    points: ["Confirm each payment once, for good", "A clear history if there's ever a dispute"],
  },
];

export function Audience() {
  return (
    <Section id="who" eyebrow="Who it's for" title="For anyone who has ever been sent a screenshot and wondered.">
      <ul className="grid gap-4 lg:grid-cols-3">
        {AUDIENCES.map((a) => (
          <li key={a.title} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
            <span className="grid size-11 place-items-center rounded-lg bg-truth-bg text-truth"><Icon name={a.icon} className="size-6" /></span>
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-xl font-semibold">{a.title}</h3>
              <p className="text-ink-2">{a.text}</p>
            </div>
            <ul className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
              {a.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm">
                  <Icon name="check" className="mt-0.5 size-4 shrink-0 text-truth" />
                  {p}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
