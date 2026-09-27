import { Icon, type IconName } from "@/components/ui/Icon";
import { Section } from "./Section";

const AUDIENCES: Array<{ icon: IconName; title: string; text: string; points: string[] }> = [
  {
    icon: "person",
    title: "Busy people and small offices",
    text: "Toner, data top-ups, monthly provisions: let the AI find and buy them.",
    points: ["Set a budget once; it can't be exceeded", "Repeat purchases within a weekly or monthly cap"],
  },
  {
    icon: "shop",
    title: "Sellers",
    text: "Get paid by AI shoppers, with proof the buyer authorised it.",
    points: ["Payments straight to your own bank account", "A signed receipt you can verify for every order"],
  },
  {
    icon: "bot",
    title: "AI assistants and platforms",
    text: "Give your assistant the power to buy, without the risk.",
    points: ["Policy enforced outside the model", "Every run traced and tested against dishonest sellers"],
  },
];

export function Audience() {
  return (
    <Section id="who" eyebrow="Who it's for" title="For anyone who wants AI to do the shopping, but not the deciding.">
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
