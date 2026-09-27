"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { useAppDispatch } from "@/store/hooks";
import type { CaseDecision } from "@/types/api";
import { useDecideCaseMutation } from "../api";
import { DECISION } from "../lib/labels";

/** Analyst decisions. Each needs a second click, and each becomes a training label. */
export function DecisionBar({ caseId, decisions }: { caseId: string; decisions: CaseDecision[] }) {
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState<CaseDecision | null>(null);
  const [decide, { isLoading, error }] = useDecideCaseMutation();

  async function confirm() {
    if (!pending) return;
    const result = await decide({ id: caseId, decision: pending });
    if ("data" in result) {
      dispatch(notify(`${DECISION[pending].label}: done.`));
      setPending(null);
    }
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface p-4">
        <p className="font-semibold">{DECISION[pending].label}?</p>
        <p className="text-sm text-ink-2">This is recorded with your name and used to train the risk models.</p>
        {error && <Alert tone="bad">{errorMessage(error)}</Alert>}
        <div className="flex gap-2">
          <Button variant={DECISION[pending].variant} onClick={confirm} loading={isLoading}>Confirm</Button>
          <Button variant="ghost" onClick={() => setPending(null)}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {decisions.map((d) => (
        <Button key={d} variant={DECISION[d].variant} onClick={() => setPending(d)}>
          {DECISION[d].label}
        </Button>
      ))}
    </div>
  );
}
