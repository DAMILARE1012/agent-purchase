"use client";

import { useState } from "react";
import { Alert, Card, ErrorState, Field, Icon, LoadingState, PageHeader, Select } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import type { EvalResult } from "@/types/domain";
import { useGetAgentVersionsQuery, useGetEvalResultsQuery, useGetRangeReportsQuery } from "../api";
import { fooledRate, formatDelta, formatMetric, improvement, releaseGate, violations } from "../lib/gates";

const SUITE_LABEL: Record<EvalResult["suite"], { title: string; about: string }> = {
  intent_fidelity: { title: "Mandate drafting", about: "Sentences with labelled limits. A draft broader than the request is the dangerous error." },
  shopping_tasks: { title: "Shopping tasks", about: "Benign tasks with a known best cart across the sandbox sellers." },
  catalog_reading: { title: "Catalog reading", about: "Generated flyer and price-list photos with exact labels." },
  gate_properties: { title: "Gate properties", about: "Generated carts that break a rule. Every one must be refused." },
};

/** Two agent versions side by side, with the CI release verdict. */
export function EvalComparison({ initialA, initialB }: { initialA?: string; initialB?: string }) {
  const { data: versions } = useGetAgentVersionsQuery();
  const { data: results, error, isLoading } = useGetEvalResultsQuery();
  const { data: range } = useGetRangeReportsQuery();

  const withResults = [...new Set(results?.map((r) => r.versionId) ?? [])];
  const live = versions?.find((v) => v.status === "live")?.id;
  const candidate = versions?.find((v) => v.status === "candidate")?.id;
  const [a, setA] = useState(initialA ?? "");
  const [b, setB] = useState(initialB ?? "");
  const A = a || live || withResults[0] || "";
  const B = b || candidate || withResults[1] || "";

  if (isLoading) return <LoadingState />;
  if (error || !results) return <ErrorState message={errorMessage(error) ?? ""} />;

  const resA = results.filter((r) => r.versionId === A);
  const resB = results.filter((r) => r.versionId === B);
  const rangeA = range?.find((r) => r.versionId === A);
  const rangeB = range?.find((r) => r.versionId === B);
  const verdict = releaseGate(resA, resB, rangeA, rangeB);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Evaluations" description="Every agent version runs the same test suites. A version that gets worse can't ship." />

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field id="version-a" label="Baseline (A)">
          <Select id="version-a" value={A} onChange={(e) => setA(e.target.value)}>
            {withResults.map((v) => <option key={v} value={v}>{v}{v === live ? " (live)" : ""}</option>)}
          </Select>
        </Field>
        <Field id="version-b" label="Candidate (B)">
          <Select id="version-b" value={B} onChange={(e) => setB(e.target.value)}>
            {withResults.map((v) => <option key={v} value={v}>{v}{v === candidate ? " (candidate)" : ""}</option>)}
          </Select>
        </Field>
      </Card>

      {A === B ? (
        <Alert title="Pick two different versions to compare." />
      ) : (
        <Alert
          tone={verdict.pass ? "truth" : "bad"}
          title={verdict.pass ? `${B} passes the release gate` : `${B} is blocked by the release gate`}
        >
          {verdict.pass ? (
            "Every threshold passes, nothing regressed beyond tolerance, and no payment broke a mandate in the test marketplace."
          ) : (
            <ul className="list-disc pl-4">{verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
        </Alert>
      )}

      {resB.map((suiteB) => {
        const suiteA = resA.find((s) => s.suite === suiteB.suite);
        return (
          <Card key={suiteB.suite} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">{SUITE_LABEL[suiteB.suite].title}</h2>
              <span className="text-xs text-muted">{suiteB.cases.toLocaleString()} cases · run {formatDateTime(suiteB.runAt)}</span>
            </div>
            <p className="text-sm text-muted">{SUITE_LABEL[suiteB.suite].about}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 font-semibold">Metric</th>
                    <th className="py-2 text-right font-semibold">A</th>
                    <th className="py-2 text-right font-semibold">B</th>
                    <th className="py-2 text-right font-semibold">Change</th>
                    <th className="py-2 text-right font-semibold">Threshold</th>
                    <th className="py-2 pl-4 font-semibold">B passes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {suiteB.metrics.map((mB) => {
                    const mA = suiteA?.metrics.find((x) => x.name === mB.name);
                    const delta = mA ? improvement(mA, mB) : 0;
                    return (
                      <tr key={mB.name}>
                        <td className="py-2.5">{mB.name}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-2">{mA ? formatMetric(mA) : "—"}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{formatMetric(mB)}</td>
                        <td className={cn("py-2.5 text-right tabular-nums", delta > 0 ? "text-truth" : delta < 0 ? "text-bad" : "text-muted")}>
                          {!mA || delta === 0 ? "same" : `${delta > 0 ? "better" : "worse"} by ${formatDelta(mB.unit, Math.abs(mB.value - mA.value))}`}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink-2">
                          {mB.threshold === null ? "—" : `${mB.better === "higher" ? "≥" : "≤"} ${formatMetric({ unit: mB.unit, value: mB.threshold })}`}
                        </td>
                        <td className="py-2.5 pl-4">
                          <Icon name={mB.pass ? "check" : "close"} className={mB.pass ? "text-truth" : "text-bad"} label={mB.pass ? "Passes" : "Fails"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {(rangeA || rangeB) && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">Test marketplace</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[{ label: "A", id: A, r: rangeA }, { label: "B", id: B, r: rangeB }].map(({ label, id, r }) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-muted">{label} · <span className="font-mono">{id}</span></dt>
                {r ? (
                  <dd>
                    Fooled in <b>{fooledRate(r).toFixed(1)}%</b> of attack runs ·{" "}
                    <b className={violations(r) ? "text-bad" : "text-truth"}>{violations(r)}</b> payments broke a mandate
                  </dd>
                ) : (
                  <dd className="text-muted">Not run yet</dd>
                )}
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
