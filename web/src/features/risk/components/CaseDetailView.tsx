"use client";

import Link from "next/link";
import { Alert, Card, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetCaseQuery } from "../api";
import { CASE_KIND_LABEL } from "../lib/labels";
import { CopilotPanel } from "./CopilotPanel";
import { DecisionBar } from "./DecisionBar";
import { EvidenceList } from "./EvidenceList";
import { RiskScore } from "./RiskScore";

export function CaseDetailView({ id }: { id: string }) {
  const { data: c, isLoading, error } = useGetCaseQuery(id);

  if (isLoading) return <LoadingState label="Loading case…" />;
  if (error || !c) return <ErrorState message={errorMessage(error) ?? "Case not found."} />;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/risk" className="flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><span aria-hidden="true">←</span> Case queue</Link>
      <PageHeader
        eyebrow={`${CASE_KIND_LABEL[c.kind]} · opened ${formatDateTime(c.openedAt)}`}
        title={c.title}
        actions={<RiskScore score={c.riskScore} />}
      />

      {c.resolution ? (
        <Alert tone="truth" title="Resolved">{c.resolution}</Alert>
      ) : (
        <DecisionBar caseId={c.id} decisions={c.allowedDecisions} />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Evidence</h2>
          <EvidenceList items={c.evidence} />
        </Card>
        <CopilotPanel copilot={c.copilot} />
      </div>
    </div>
  );
}
