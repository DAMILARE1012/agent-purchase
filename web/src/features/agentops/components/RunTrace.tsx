"use client";

import { Alert, Badge, ButtonLink, Card, ErrorState, Icon, LoadingState, PageHeader, StatTile } from "@/components/ui";
import { CartCard, GateChecks, RULE_FAILED, RunStatusBadge, isActiveRun, useGetRunQuery } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { maskName } from "@/lib/mask";
import type { RunStep } from "@/types/domain";
import { formatUsd } from "../lib/format";

const KIND_LABEL: Record<RunStep["kind"], string> = {
  search_catalog: "search",
  get_product: "product",
  read_catalog_image: "image",
  request_cart: "cart request",
  propose_cart: "propose",
  ask_shopper: "ask",
  give_up: "give up",
  gate: "gate",
  payment: "payment",
};

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface RunTraceProps {
  runId: string;
  /** Support sees traces with the shopper's name masked. */
  masked?: boolean;
  backHref: string;
}

/** Every model call and tool call in a run, and why the gate decided what it did. */
export function RunTrace({ runId, masked = false, backHref }: RunTraceProps) {
  const first = useGetRunQuery(runId);
  const { data: run, error, isLoading } = useGetRunQuery(runId, { pollingInterval: first.data && isActiveRun(first.data) ? 1_000 : 0 });
  if (isLoading) return <LoadingState />;
  if (error || !run) return <ErrorState message={errorMessage(error) ?? "Run not found."} />;

  const failed = run.decision?.checks.filter((c) => c.result === "fail") ?? [];
  const modelSteps = run.steps.filter((s) => s.model);
  const flagged = run.steps.filter((s) => (s.injectionScore ?? 0) >= 0.5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Run ${run.id}`}
        title={run.cart ? `${masked ? maskName(run.shopperName) : run.shopperName} → ${run.cart.sellerName}` : masked ? maskName(run.shopperName) : run.shopperName}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <RunStatusBadge status={run.status} />
            <span>{formatDateTime(run.startedAt)}</span>
            <span className="font-mono text-xs">{run.agentVersion}</span>
            {masked && <Badge>Personal details masked</Badge>}
          </span>
        }
        actions={<ButtonLink href={backHref} variant="secondary">Back</ButtonLink>}
      />

      {run.decision?.outcome === "deny" && (
        <Alert tone="bad" title={`Why the gate refused it: ${failed.map((c) => RULE_FAILED[c.rule]).join(", ")}`}>
          <ul className="list-disc pl-4">{failed.map((c) => <li key={c.rule}>{c.detail}</li>)}</ul>
          {flagged.length > 0 && (
            <p className="mt-2">
              The agent read seller content flagged as possible hidden instructions in {flagged.length === 1 ? "1 step" : `${flagged.length} steps`}, then proposed this cart:
              the agent was fooled, and the gate caught it.
            </p>
          )}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Steps" value={run.totals.steps} detail={`${modelSteps.length} model calls`} />
        <StatTile label="Tokens" value={run.totals.tokens.toLocaleString("en-NG")} />
        <StatTile label="Model cost" value={formatUsd(run.totals.costMicroUsd)} />
        <StatTile label="Model time" value={`${(run.totals.latencyMs / 1000).toFixed(1)} s`} detail={flagged.length === 0 ? "No flagged seller inputs" : flagged.length === 1 ? "1 flagged seller input" : `${flagged.length} flagged seller inputs`} />
      </div>

      <Card className="flex flex-col gap-3 p-0">
        <h2 className="px-5 pt-5 font-display text-lg font-semibold">Steps</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-y border-line bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Time</th>
                <th className="px-4 py-2 font-semibold">Kind</th>
                <th className="px-4 py-2 font-semibold">What happened</th>
                <th className="px-4 py-2 font-semibold">Seller input</th>
                <th className="px-4 py-2 font-semibold">Model call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-xs">
              {run.steps.map((s, i) => (
                <tr key={s.id} className={cn(s.kind === "gate" && run.decision?.outcome === "deny" && "bg-bad-bg/60")}>
                  <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{time.format(new Date(s.at))}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{KIND_LABEL[s.kind]}</td>
                  <td className="min-w-[18rem] px-4 py-2.5 font-sans text-sm">{s.summary}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {s.untrusted ? (
                      <span className={cn((s.injectionScore ?? 0) >= 0.5 ? "font-semibold text-ai" : "text-ink-2")}>
                        untrusted{s.injectionScore !== null ? ` · ${s.injectionScore.toFixed(2)}` : ""}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="min-w-[13rem] px-4 py-2.5">
                    {s.model ? (
                      <>
                        <span className="block">{s.model}</span>
                        <span className="text-muted">{s.tokensIn.toLocaleString()} in · {s.tokensOut} out · {s.latencyMs} ms · {formatUsd(s.costMicroUsd)}</span>
                      </>
                    ) : (
                      <span className="text-muted">code · {s.latencyMs} ms</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-2 px-5 pb-5 text-xs text-muted">
          <Icon name="alert" className="size-3.5" /> Injection score comes from a prompt-injection classifier. It&apos;s a signal for monitoring; the gate never relies on it.
        </p>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {run.cart ? <CartCard cart={run.cart} /> : <Card>No cart was proposed. {run.outcomeNote}</Card>}
        {run.decision && <GateChecks decision={run.decision} />}
      </div>
    </div>
  );
}
