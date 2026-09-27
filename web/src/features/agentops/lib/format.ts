/** Model costs are tracked in micro-dollars; show them in dollars with enough precision to compare. */
export function formatUsd(micro: number): string {
  const usd = micro / 1e6;
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

export const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
