"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Dialog, EmptyState, ErrorState, Icon, LoadingState, PageHeader } from "@/components/ui";
import { notify } from "@/features/notifications";
import { RunRow, useGetRunsQuery, useStartRunMutation } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useNow } from "@/lib/useNow";
import { useAppDispatch } from "@/store/hooks";
import { useGetMandateQuery, useRevokeMandateMutation } from "../api";
import { LimitsTable } from "./LimitsTable";
import { MandateStatusBadge, ModeBadge, SpendMeter } from "./MandateBits";
import { SignatureCard } from "./SignatureCard";

export function MandateDetail({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const now = useNow();
  const { data: m, error, isLoading } = useGetMandateQuery(mandateId);
  const { data: runs } = useGetRunsQuery({ mandateId });
  const [startRun, starting] = useStartRunMutation();
  const [revoke, revoking] = useRevokeMandateMutation();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error || !m) return <ErrorState message={errorMessage(error) ?? "Mandate not found."} />;

  async function shop() {
    const res = await startRun({ mandateId });
    if ("data" in res && res.data) router.push(`/shop/runs/${res.data.id}`);
  }

  async function cancel() {
    const res = await revoke(mandateId);
    setConfirmCancel(false);
    if ("data" in res) dispatch(notify("Mandate cancelled. The AI can't use it any more."));
  }

  const usesLeft = Math.max(0, m.limits.maxUses - m.uses);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mandate"
        title={m.limits.item}
        description={<span className="italic">“{m.request}”</span>}
        actions={
          m.status === "active" && (
            <>
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancel mandate</Button>
              <Button onClick={shop} loading={starting.isLoading}><Icon name="bot" className="size-4" /> Start shopping</Button>
            </>
          )
        }
      />
      {starting.error && <Alert tone="bad">{errorMessage(starting.error)}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Exact limits you signed</h2>
            <div className="flex gap-2"><ModeBadge mode={m.mode} /><MandateStatusBadge status={m.status} /></div>
          </div>
          <LimitsTable limits={m.limits} mode={m.mode} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Usage</h2>
            <SpendMeter mandate={m} />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Uses left</dt><dd className="font-semibold">{m.status === "active" ? usesLeft : 0} of {m.limits.maxUses}</dd></div>
              <div><dt className="text-muted">{m.status === "revoked" ? "Cancelled" : "Expires"}</dt><dd className="font-semibold">{formatDateTime(m.revokedAt ?? m.limits.expiresAt)}</dd></div>
            </dl>
          </Card>
          <SignatureCard mandate={m} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Shopping under this mandate</h2>
        {!runs || runs.length === 0 ? (
          <EmptyState title="The AI hasn't shopped with this mandate yet">
            {m.status === "active" ? "Click Start shopping when you're ready." : "This mandate can't be used any more."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {runs.map((r) => <RunRow key={r.id} run={r} now={now} />)}
          </ul>
        )}
      </section>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this mandate?" description="The AI shopper won't be able to use it again. Anything already paid stays paid; a cart waiting for your approval is declined.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button>
          <Button variant="danger" loading={revoking.isLoading} onClick={cancel}>Cancel mandate</Button>
        </div>
      </Dialog>
    </div>
  );
}
