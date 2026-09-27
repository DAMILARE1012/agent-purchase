import { Badge, Icon, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AgentRun, RunStep } from "@/types/domain";
import { isActiveRun, STEP_ICON } from "../lib/labels";

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function stepTone(step: RunStep, run: AgentRun): string {
  if (step.kind === "gate") return run.decision?.outcome === "deny" ? "bg-bad-bg text-bad" : "bg-truth-bg text-truth";
  if (step.kind === "payment") return "bg-truth-bg text-truth";
  if (step.kind === "give_up") return "bg-surface-2 text-muted";
  return "bg-surface-2 text-ink-2";
}

/** The agent's steps, in order. Seller content is marked as untrusted. */
export function RunTimeline({ run }: { run: AgentRun }) {
  const active = isActiveRun(run);
  return (
    <ol className="flex flex-col">
      {run.status === "queued" && (
        <li className="flex items-center gap-3 py-3 text-ink-2">
          <Spinner className="size-4" />
          In the queue{run.queuePosition ? ` (position ${run.queuePosition})` : ""}. The AI shopper starts in a moment.
        </li>
      )}
      {run.steps.map((step, i) => {
        const last = i === run.steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {(!last || active) && <span aria-hidden="true" className="absolute top-9 bottom-0 left-4 w-px bg-line" />}
            <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-full", stepTone(step, run))}>
              <Icon name={STEP_ICON[step.kind]} className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              <p className="text-ink">{step.summary}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <time dateTime={step.at}>{time.format(new Date(step.at))}</time>
                {step.untrusted && <Badge>Seller content</Badge>}
                {step.injectionScore !== null && step.injectionScore >= 0.5 && <Badge tone="ai">Possible hidden instructions</Badge>}
                {step.cached ? (
                  <span className="font-mono">cached answer</span>
                ) : (
                  step.model && <span className="font-mono">{step.tokensIn + step.tokensOut} tokens · {(step.latencyMs / 1000).toFixed(1)} s</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
      {run.status === "running" && (
        <li className="flex items-center gap-3 pt-1 text-ink-2">
          <span className="grid size-8 place-items-center"><Spinner className="size-4" /></span>
          Deciding the next step…
        </li>
      )}
    </ol>
  );
}
