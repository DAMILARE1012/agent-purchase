const POINTS = [
  { n: "01", title: "Bank transfers are final", text: "There's no chargeback. If an AI pays the wrong account, the money is gone." },
  { n: "02", title: "An AI can be talked into things", text: "Sellers can hide instructions in a product page or inside a photo of a price list." },
  { n: "03", title: "A real shop, someone else's account", text: "A cart can carry a trusted store's name and a scammer's account number." },
];

/** The problem, stated plainly, before the solution. */
export function ProblemStrip() {
  return (
    <section className="px-4 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-bad">The problem</p>
          <h2 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-[2.6rem]">
            An AI with access to your money needs rules it can&apos;t talk its way out of.
          </h2>
          <p className="text-lg leading-relaxed text-ink-2">
            Most shopping in Nigeria ends in a bank transfer. That&apos;s fast and cheap, and it&apos;s exactly why an AI shouldn&apos;t be trusted to
            send one on its own judgement.
          </p>
        </div>
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {POINTS.map((p) => (
            <li key={p.n} className="grid grid-cols-[3rem_1fr] gap-4 py-6">
              <span className="font-mono text-sm font-semibold text-muted">{p.n}</span>
              <div>
                <h3 className="font-display text-xl font-semibold">{p.title}</h3>
                <p className="mt-1 text-ink-2">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
