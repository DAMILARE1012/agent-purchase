import { Badge, Card, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CheckResult, GateDecision } from "@/types/domain";
import { OUTCOME } from "../lib/labels";

const MARK: Record<CheckResult, { glyph: "check" | "close" | "alert" | "list"; className: string; label: string }> = {
  pass: { glyph: "check", className: "bg-truth-bg text-truth", label: "Passed" },
  fail: { glyph: "close", className: "bg-bad-bg text-bad", label: "Failed" },
  warn: { glyph: "alert", className: "bg-ai-bg text-ai", label: "Warning" },
  skipped: { glyph: "list", className: "bg-surface-2 text-muted", label: "Skipped" },
};

/** What the gate checked, rule by rule. Failures first, then warnings, then passes. */
export function GateChecks({ decision }: { decision: GateDecision }) {
  const order: Record<CheckResult, number> = { fail: 0, warn: 1, pass: 2, skipped: 3 };
  const checks = [...decision.checks].sort((a, b) => order[a.result] - order[b.result]);
  const outcome = OUTCOME[decision.outcome];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Icon name="shield" className="size-5 text-muted" /> The gate&apos;s checks
        </h3>
        <Badge tone={outcome.tone}>{outcome.label}</Badge>
      </div>
      <p className="text-sm text-muted">
        Plain code outside the AI, version <span className="font-mono">{decision.gateVersion}</span>. The AI can suggest a cart; only these checks can release money.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {checks.map((c) => {
          const mark = MARK[c.result];
          return (
            <li key={c.rule} className="flex gap-3 py-2.5">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", mark.className)}>
                <Icon name={mark.glyph} className="size-3.5" label={mark.label} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className={cn("font-semibold", c.result === "fail" && "text-bad")}>{c.label}</span>
                <span className="text-sm text-ink-2">{c.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
