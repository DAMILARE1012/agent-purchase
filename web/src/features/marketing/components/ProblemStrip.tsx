const POINTS = [
  { stat: "Seconds", text: "is all it takes to edit the amount on a payment screenshot." },
  { stat: "Nothing", text: "on a screenshot tells you whether the money actually arrived, or stayed." },
  { stat: "Once", text: "is how often a genuine receipt should be accepted. Screenshots can be reused forever." },
];

/** The problem, stated plainly, before the solution. */
export function ProblemStrip() {
  return (
    <section className="border-b border-line bg-surface px-4 py-14">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_2fr] md:items-center">
        <h2 className="font-display text-2xl font-bold text-balance sm:text-3xl">A screenshot is a picture, not a payment.</h2>
        <ul className="grid gap-6 sm:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.stat} className="flex flex-col gap-1 border-l-2 border-bad pl-4">
              <span className="font-display text-xl font-bold text-bad">{p.stat}</span>
              <span className="text-sm text-ink-2">{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
