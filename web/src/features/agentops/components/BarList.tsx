import { cn } from "@/lib/cn";

interface BarListProps {
  label: string;
  rows: Array<{ key: string; label: string; value: number; display?: string }>;
  /** Scale bars against this instead of the largest value (e.g. 100 for percentages). */
  max?: number;
  className?: string;
}

/**
 * A single-series horizontal bar list: label, thin bar, value. One hue, so no
 * legend; values are printed in text colour so the bar never carries meaning alone.
 */
export function BarList({ label, rows, max, className }: BarListProps) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className={cn("flex flex-col gap-2.5", className)}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(7rem,40%)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="block h-full rounded-r-full bg-chart-out" style={{ width: `${Math.min(100, (r.value / top) * 100)}%` }} />
          </span>
          <span className="min-w-12 text-right font-semibold tabular-nums">{r.display ?? r.value}</span>
        </li>
      ))}
    </ul>
  );
}
