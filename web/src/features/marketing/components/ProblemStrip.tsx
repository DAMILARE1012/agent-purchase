const POINTS = [
  { stat: "No undo", text: "Bank transfers are final. There's no chargeback if an AI pays the wrong person." },
  { stat: "Easy to fool", text: "Sellers can hide instructions in a page or a picture, and an AI may follow them." },
  { stat: "Wrong account", text: "A cart can name a real shop and carry someone else's account number." },
];

/** The problem, stated plainly, before the solution. */
export function ProblemStrip() {
  return (
    <section className="border-b border-line bg-surface px-4 py-14">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_2fr] md:items-center">
        <h2 className="font-display text-2xl font-bold text-balance sm:text-3xl">An AI with your bank account needs rules it can&apos;t talk its way out of.</h2>
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
