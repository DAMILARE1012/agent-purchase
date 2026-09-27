import { cn } from "@/lib/cn";

/** Severity meter: the fill carries severity, the track is a lighter step of the same hue, the number is always shown. */
export function RiskMeter({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted">No score</span>;
  const level = score >= 0.8 ? { fill: "bg-bad", track: "bg-bad-bg", label: "High" } : score >= 0.4 ? { fill: "bg-ai", track: "bg-ai-bg", label: "Medium" } : { fill: "bg-truth", track: "bg-truth-bg", label: "Low" };
  return (
    <span className="flex items-center gap-2" title={`${level.label} risk`}>
      <span className={cn("h-1.5 w-20 overflow-hidden rounded-full", level.track)}>
        <span className={cn("block h-full rounded-full", level.fill)} style={{ width: `${Math.round(score * 100)}%` }} />
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums">{score.toFixed(2)}</span>
      <span className="sr-only">{level.label} risk</span>
    </span>
  );
}
