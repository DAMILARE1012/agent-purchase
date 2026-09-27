"use client";

import Link from "next/link";
import { Badge, Card, ErrorState, LoadingState, PageHeader, type Tone } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import type { AgentVersion } from "@/types/domain";
import { useGetAgentVersionsQuery } from "../api";

const STATUS: Record<AgentVersion["status"], { label: string; tone: Tone }> = {
  live: { label: "Live", tone: "truth" },
  candidate: { label: "Candidate", tone: "ai" },
  retired: { label: "Retired", tone: "neutral" },
};

/** Prompts, models, settings and tools released together as one version. */
export function AgentVersions() {
  const { data, error, isLoading } = useGetAgentVersionsQuery();
  const live = data?.find((v) => v.status === "live");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agent versions"
        description="A version bundles prompt versions, models and settings. Changing any part makes a new version, which must pass evaluation before it ships."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <div className="flex flex-col gap-4">
          {data?.map((v) => (
            <Card key={v.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-lg font-semibold">{v.id}</h2>
                    <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
                  </div>
                  <span className="text-sm text-muted">Created {formatDateTime(v.createdAt)}</span>
                </div>
                {live && v.id !== live.id && v.status !== "retired" && (
                  <Link href={`/ops/evals?a=${live.id}&b=${v.id}`} className="text-sm font-semibold text-crypto hover:underline">Compare with live</Link>
                )}
              </div>
              <p className="text-ink-2">{v.changelog}</p>
              <div className="grid gap-4 md:grid-cols-3">
                <dl className="flex flex-col gap-2 text-sm">
                  <dt className="text-muted">Model</dt>
                  <dd className="font-mono">{v.model}</dd>
                  <dt className="text-muted">Fallback</dt>
                  <dd className="font-mono">{v.fallbackModel}</dd>
                </dl>
                <dl className="flex flex-col gap-2 text-sm">
                  <dt className="text-muted">Temperature</dt>
                  <dd className="font-mono">{v.params.temperature}</dd>
                  <dt className="text-muted">Reasoning effort</dt>
                  <dd className="font-mono">{v.params.reasoningEffort}</dd>
                </dl>
                <div className="flex flex-col gap-2 text-sm">
                  <span className="text-muted">Prompts</span>
                  <ul className="flex flex-col gap-1">
                    {v.prompts.map((p) => {
                      const changed = live && v.id !== live.id && live.prompts.find((lp) => lp.task === p.task)?.version !== p.version;
                      return (
                        <li key={p.task} className="flex items-center gap-2 font-mono">
                          {p.task} <span className="text-muted">{p.version}</span>
                          {changed && <Badge tone="ai">Changed</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
