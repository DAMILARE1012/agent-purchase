import type { EvalMetric, RangeReport } from "@/types/domain";

export function formatMetric(m: Pick<EvalMetric, "value" | "unit">): string {
  switch (m.unit) {
    case "%":
      return `${m.value.toFixed(1)}%`;
    case "ms":
      return `${(m.value / 1000).toFixed(1)} s`;
    case "$":
      return `$${m.value.toFixed(4)}`;
    case "₦":
      return `₦${m.value.toLocaleString("en-NG")}`;
    case "steps":
      return `${m.value}`;
    case "tokens":
      return `${Math.round(m.value).toLocaleString("en-NG")}`;
  }
}

/** A difference between two values: percentages differ by points, not percent. */
export function formatDelta(unit: EvalMetric["unit"], value: number): string {
  return unit === "%" ? `${value.toFixed(1)} pts` : formatMetric({ unit, value });
}

/** Positive when B is better than A, respecting the metric's direction. */
export function improvement(a: EvalMetric, b: EvalMetric): number {
  return a.better === "higher" ? b.value - a.value : a.value - b.value;
}

export const fooledRate = (r: RangeReport) => {
  const runs = r.families.reduce((n, f) => n + f.runs, 0);
  return runs ? (r.families.reduce((n, f) => n + f.fooled, 0) / runs) * 100 : 0;
};

export const violations = (r: RangeReport) => r.families.reduce((n, f) => n + f.violations, 0);
