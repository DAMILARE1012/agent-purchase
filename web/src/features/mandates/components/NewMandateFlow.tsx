"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Icon, PageHeader, SegmentedControl, Textarea } from "@/components/ui";
import { notify } from "@/features/notifications";
import { useStartRunMutation } from "@/features/runs";
import { errorMessage } from "@/lib/api-error";
import { useNow } from "@/lib/useNow";
import { useAppDispatch } from "@/store/hooks";
import type { Mandate, MandateDraft, MandateLimits, MandateMode } from "@/types/domain";
import { useDraftMandateMutation } from "../api";
import { validateLimits } from "../lib/form";
import { LimitsTable } from "./LimitsTable";
import { MandateForm } from "./MandateForm";
import { MandateSignDialog } from "./MandateSignDialog";

const EXAMPLES: Array<{ text: string; mode: MandateMode }> = [
  { text: "HP 107a toner, under ₦40,000, from a verified seller, delivered by Friday", mode: "present" },
  { text: "A 50kg bag of rice, 5 litres of vegetable oil and a carton of Indomie, under ₦110,000, delivered by Saturday", mode: "present" },
  { text: "Top up my MTN data with 10GB when it runs low, at most ₦5,000 a week", mode: "not_present" },
];

/** Sentence → Qwen's draft → exact limits the shopper edits → passkey signature. */
export function NewMandateFlow({ initialRequest = "" }: { initialRequest?: string }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const now = useNow();
  const [request, setRequest] = useState(initialRequest);
  const [mode, setMode] = useState<MandateMode>("present");
  const [draft, setDraft] = useState<MandateDraft | null>(null);
  const [limits, setLimits] = useState<MandateLimits | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [signing, setSigning] = useState(false);
  const [startNow, setStartNow] = useState(true);

  const [compile, compiling] = useDraftMandateMutation();
  const [startRun] = useStartRunMutation();

  const errors = limits ? validateLimits(limits, mode, now) : {};
  const errorCount = Object.keys(errors).length;

  async function makeDraft() {
    const res = await compile({ request, mode });
    if ("data" in res && res.data) {
      setDraft(res.data);
      setLimits(res.data.limits);
      setShowErrors(false);
    }
  }

  function openSigning() {
    setShowErrors(true);
    if (!limits || errorCount > 0) return;
    setSigning(true);
  }

  async function signed(mandate: Mandate) {
    setSigning(false);
    dispatch(notify("Mandate signed with your passkey."));
    if (startNow) {
      const run = await startRun({ mandateId: mandate.id });
      if ("data" in run && run.data) return router.push(`/shop/runs/${run.data.id}`);
    }
    router.push(`/shop/mandates/${mandate.id}`);
  }

  if (!draft || !limits) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New mandate" description="Tell the AI what to buy. You'll check the exact limits before anything is signed." />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card className="flex flex-col gap-5">
            <Field id="request" label="What should the AI buy?" hint="Include a budget, which sellers, and when you need it.">
              <Textarea
                id="request"
                rows={3}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="HP 107a toner, under ₦40,000, from a verified seller, delivered by Friday"
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Try an example</span>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e.text}
                    type="button"
                    onClick={() => { setRequest(e.text); setMode(e.mode); }}
                    className="rounded-full border border-line-strong px-3 py-1 text-left text-sm text-ink-2 hover:bg-surface-2"
                  >
                    {e.text}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Approvals</span>
              <SegmentedControl
                label="Approvals"
                size="md"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "present", label: "I'll approve each cart" },
                  { value: "not_present", label: "Buy while I'm away" },
                ]}
              />
              <p className="text-sm text-muted">
                {mode === "present"
                  ? "The AI finds a cart; you see it and approve the payment."
                  : "For repeat purchases. The gate pays within a spending cap and you're notified after each purchase."}
              </p>
            </div>
            {compiling.error && <Alert tone="bad">{errorMessage(compiling.error)}</Alert>}
            <div>
              <Button onClick={makeDraft} loading={compiling.isLoading} disabled={!request.trim()}>
                <Icon name="spark" className="size-4" /> {compiling.isLoading ? "Reading your request…" : "Draft the limits"}
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-4 bg-surface-2/50">
            <h2 className="font-display text-lg font-semibold">How a mandate works</h2>
            <ol className="flex flex-col gap-3 text-ink-2">
              <li><b className="text-ink">1. Qwen drafts the limits</b> from your words. Anything it can&apos;t pin down is set to the strictest option.</li>
              <li><b className="text-ink">2. You check the exact values</b> and change anything that&apos;s wrong.</li>
              <li><b className="text-ink">3. Your passkey signs them.</b> From then on, no payment can happen outside these limits, whatever the AI or a seller says.</li>
            </ol>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="New mandate"
        title="Check the exact limits"
        description={<>Drafted from: <span className="italic">“{draft.request}”</span></>}
        actions={<Button variant="secondary" onClick={() => { setDraft(null); setLimits(null); }}>Change request</Button>}
      />
      {draft.questions.length > 0 && (
        <Alert tone="ai" title="Qwen needs a few answers. Until you give them, the strictest option applies.">
          <ul className="list-disc pl-4">{draft.questions.map((q) => <li key={q.field}>{q.question}</li>)}</ul>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <MandateForm limits={limits} mode={mode} defaulted={draft.defaulted} evidence={draft.evidence} errors={showErrors ? errors : {}} onChange={setLimits} />
        </Card>
        <Card className="flex flex-col gap-4 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-semibold">You&apos;re signing exactly this</h2>
          <LimitsTable limits={limits} mode={mode} compact />
          {showErrors && errorCount > 0 && <Alert tone="bad" title={`Fix ${errorCount === 1 ? "1 field" : `${errorCount} fields`} before signing`} />}
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--crypto)]" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
            Start shopping as soon as it&apos;s signed
          </label>
          <Button onClick={openSigning}><Icon name="key" className="size-4" /> Sign with passkey</Button>
          <p className="text-xs text-muted">
            Drafted by {draft.compiledBy}. Every value comes from your words, quoted under each field; anything the AI couldn&apos;t tie to your words was discarded.
          </p>
        </Card>
      </div>

      <MandateSignDialog open={signing} onClose={() => setSigning(false)} draft={draft} limits={limits} mode={mode} onSigned={signed} />
    </div>
  );
}
