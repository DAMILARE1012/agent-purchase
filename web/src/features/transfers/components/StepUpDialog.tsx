"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Dialog, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import type { RiskSummary } from "@/types/api";
import { useCompleteStepUpMutation } from "../api";

interface StepUpDialogProps {
  tx: string | null;
  risk: RiskSummary | null;
  onClose: () => void;
  onVerified: (tx: string) => void;
}

/** Extra verification the policy engine asks for on medium-risk payments (§6.2). */
export function StepUpDialog({ tx, risk, onClose, onVerified }: StepUpDialogProps) {
  const [code, setCode] = useState("");
  const [completeStepUp, { isLoading, error, reset }] = useCompleteStepUpMutation();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tx) return;
    const result = await completeStepUp({ tx, code });
    if ("data" in result) {
      setCode("");
      onVerified(tx);
    }
  }

  function close() {
    setCode("");
    reset();
    onClose();
  }

  return (
    <Dialog
      open={Boolean(tx)}
      onClose={close}
      title="Confirm it's you"
      description="This payment needs one more check before it's sent."
    >
      {risk && risk.reasons.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-2">
          {risk.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="step-up-code" label="Verification code" hint="Demo code: 123456" error={errorMessage(error)}>
          <Input
            id="step-up-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={Boolean(error)}
            autoFocus
          />
        </Field>
        {!risk && <Alert tone="ai">We couldn&apos;t load why this check was needed.</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" loading={isLoading} disabled={code.length < 6}>Verify and send</Button>
        </div>
      </form>
    </Dialog>
  );
}
