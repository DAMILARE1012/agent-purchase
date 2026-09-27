"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, ButtonLink, Card, ErrorState, Icon, LoadingState, PageHeader } from "@/components/ui";
import { LimitsTable, useGetMandateQuery } from "@/features/mandates";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetRunQuery, useStartRunMutation } from "../api";
import { useRunEvents } from "../hooks/useRunEvents";
import { isActiveRun } from "../lib/labels";
import { ApprovalPanel } from "./ApprovalPanel";
import { CartCard } from "./CartCard";
import { GateChecks } from "./GateChecks";
import { RunStatusBadge } from "./RunBits";
import { RunTimeline } from "./RunTimeline";

/** One AI shopping run: live steps, the proposed cart, the gate's decision and approval. */
export function RunView({ runId }: { runId: string }) {
  const router = useRouter();
  const first = useGetRunQuery(runId);
  const active = first.data ? isActiveRun(first.data) : false;
  // Follow the run live while the agent is working: server-sent events, or polling if the stream isn't available.
  const streaming = useRunEvents(runId, active);
  const { data: run, error, isLoading } = useGetRunQuery(runId, { pollingInterval: active && !streaming ? 1_500 : 0, skipPollingIfUnfocused: true });
  const { data: mandate } = useGetMandateQuery(run?.mandateId ?? "", { skip: !run });
  const [startRun, retry] = useStartRunMutation();

  if (isLoading) return <LoadingState />;
  if (error || !run) return <ErrorState message={errorMessage(error) ?? "Run not found."} />;

  async function tryAgain() {
    const res = await startRun({ mandateId: run!.mandateId });
    if ("data" in res && res.data) router.push(`/shop/runs/${res.data.id}`);
  }

  const canRetry = mandate?.status === "active" && ["blocked", "gave_up", "declined"].includes(run.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={mandate ? `Mandate: ${mandate.limits.item}` : "AI shopping"}
        title={run.cart ? `Cart from ${run.cart.sellerName}` : isActiveRun(run) ? "Shopping…" : "No cart"}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <RunStatusBadge status={run.status} />
            <span>Started {formatDateTime(run.startedAt)}</span>
            <span className="font-mono text-xs text-muted">{run.agentVersion}</span>
            {streaming && <span className="flex items-center gap-1.5 text-xs text-truth"><span className="size-2 animate-pulse rounded-full bg-truth" /> Live</span>}
          </span>
        }
        actions={
          <>
            {mandate && <ButtonLink href={`/shop/mandates/${mandate.id}`} variant="secondary">View mandate</ButtonLink>}
            {canRetry && <Button onClick={tryAgain} loading={retry.isLoading}><Icon name="refresh" className="size-4" /> Shop again</Button>}
          </>
        }
      />

      {retry.error && <Alert tone="bad">{errorMessage(retry.error)}</Alert>}
      {run.status === "blocked" && (
        <Alert tone="bad" title="Blocked by the gate. Nothing was paid.">
          {run.outcomeNote} The AI proposed this cart, but it broke your mandate, so the money never left your account.
        </Alert>
      )}
      {(run.status === "gave_up" || run.status === "declined") && run.outcomeNote && <Alert title={run.outcomeNote} />}
      {run.status === "paying" && run.purchaseId && (
        <Alert tone="ai" title="Paying" action={<Link href={`/shop/purchases/${run.purchaseId}`} className="text-sm font-semibold hover:underline">View receipt</Link>}>
          You approved it and the gate allowed it again. The money is held and the transfer is with the bank; this updates when the bank confirms.
        </Alert>
      )}
      {run.status === "paid" && run.purchaseId && (
        <Alert tone="truth" title="Paid" action={<Link href={`/shop/purchases/${run.purchaseId}`} className="text-sm font-semibold text-truth hover:underline">View receipt</Link>}>
          {run.outcomeNote ?? "The seller has been paid."} Your signed receipt is ready.
        </Alert>
      )}
      {run.status === "failed" && run.outcomeNote && <Alert tone="bad" title={run.outcomeNote} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">What the AI did</h2>
            <span className="font-mono text-xs text-muted">
              {run.totals.steps} steps · {run.totals.tokens.toLocaleString("en-NG")} tokens · ${(run.totals.costMicroUsd / 1e6).toFixed(4)}
            </span>
          </div>
          <RunTimeline run={run} />
        </Card>

        <div className="flex flex-col gap-4">
          {run.status === "awaiting_approval" && run.cart && <ApprovalPanel run={run} />}
          {run.cart && <CartCard cart={run.cart} />}
          {run.decision && <GateChecks decision={run.decision} />}
          {mandate && (
            <Card className="flex flex-col gap-2">
              <h3 className="font-display text-lg font-semibold">Your mandate&apos;s limits</h3>
              <LimitsTable limits={mandate.limits} mode={mandate.mode} compact />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
