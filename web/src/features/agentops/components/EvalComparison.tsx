"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Dialog, ErrorState, Field, Icon, LoadingState, PageHeader, Select } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import type { EvalResult, EvalSuite } from "@/types/domain";
import { useGetAgentVersionsQuery, useGetEvalCasesQuery, useGetEvalGateQuery, useGetEvalResultsQuery, useGetRangeReportsQuery } from "../api";
import { fooledRate, formatDelta, formatMetric, improvement, violations } from "../lib/gates";

const SUITE_LABEL: Record<EvalSuite, { title: string; about: string }> = {
  intent_fidelity: { title: "Mandate drafting", about: "Sentences with labelled limits. A draft broader than the request is the dangerous error." },
  shopping_tasks: { title: "Shopping tasks", about: "Tasks across the sandbox sellers, dishonest ones included. The best cart is computed by asking every seller and the gate." },
  catalog_reading: { title: "Catalog reading", about: "Every photo catalog in the sandbox marketplace, with exact labels." },
  gate_properties: { title: "Gate properties", about: "Generated carts that break a rule. Every one must be refused. The same for every release." },
};
const SUITES: EvalSuite[] = ["intent_fidelity", "shopping_tasks", "catalog_reading", "gate_properties"];
const isVariant = (id: string) => id.includes("~");

/** Two agent versions (or a release on another model) side by side, with the release gate's verdict. */
export function EvalComparison({ initialA, initialB }: { initialA?: string; initialB?: string }) {
  const { data: versions } = useGetAgentVersionsQuery();
  const { data: results, error, isLoading } = useGetEvalResultsQuery();
  const { data: range } = useGetRangeReportsQuery();
  const [cases, setCases] = useState<{ versionId: string; suite: EvalSuite } | null>(null);

  const withResults = [...new Set(results?.map((r) => r.versionId) ?? [])].sort();
  const live = versions?.find((v) => v.status === "live")?.id;
  const candidate = versions?.find((v) => v.status === "candidate")?.id;
  const [a, setA] = useState(initialA ?? "");
  const [b, setB] = useState(initialB ?? "");
  const A = a || live || withResults[0] || "";
  const B = b || candidate || withResults.find((v) => v !== A) || "";
  const gate = useGetEvalGateQuery({ baseline: A, candidate: B }, { skip: !A || !B || A === B });

  if (isLoading) return <LoadingState />;
  if (error || !results) return <ErrorState message={errorMessage(error) ?? ""} />;

  const resA = results.filter((r) => r.versionId === A);
  const resB = results.filter((r) => r.versionId === B);
  const rangeA = range?.find((r) => r.versionId === A);
  const rangeB = range?.find((r) => r.versionId === B);
  const label = (id: string) => `${id}${id === live ? " (live)" : id === candidate ? " (candidate)" : isVariant(id) ? " (model comparison)" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Evaluations"
        description="Every agent version runs the same test suites on the real model. A version that gets worse can't ship: CI runs this same release gate."
      />

      {results.length === 0 ? (
        <Alert tone="ai" title="No evaluation results yet">Run <code className="font-mono">python -m app.evals run</code> in the api container.</Alert>
      ) : (
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field id="version-a" label="Baseline (A)">
            <Select id="version-a" value={A} onChange={(e) => setA(e.target.value)}>
              {withResults.map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </Select>
          </Field>
          <Field id="version-b" label="Candidate (B)">
            <Select id="version-b" value={B} onChange={(e) => setB(e.target.value)}>
              {withResults.map((v) => <option key={v} value={v}>{label(v)}</option>)}
            </Select>
          </Field>
        </Card>
      )}

      {A && B && (A === B ? (
        <Alert title="Pick two different versions to compare." />
      ) : gate.isLoading ? (
        <LoadingState label="Running the release gate…" />
      ) : gate.data ? (
        <Alert tone={gate.data.pass ? "truth" : "bad"} title={gate.data.pass ? `${B} passes the release gate` : `${B} is blocked by the release gate`}>
          {gate.data.pass ? (
            "Every suite is measured on the real model and up to date, every threshold passes, and nothing got worse beyond noise."
          ) : (
            <ul className="list-disc pl-4">{gate.data.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
        </Alert>
      ) : gate.error ? (
        <Alert tone="bad">{errorMessage(gate.error)}</Alert>
      ) : null)}

      {SUITES.map((suite) => {
        const suiteA = resA.find((s) => s.suite === suite);
        const suiteB = resB.find((s) => s.suite === suite);
        if (!suiteA && !suiteB) return null;
        const metricsList = (suiteB ?? suiteA)!.metrics;
        return (
          <Card key={suite} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">{SUITE_LABEL[suite].title}</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {[{ tag: "A", r: suiteA, id: A }, { tag: "B", r: suiteB, id: B }].map(({ tag, r, id }) => (
                  <span key={tag} className="flex items-center gap-1.5">
                    <b>{tag}</b> {r ? <ResultNote result={r} onCases={() => setCases({ versionId: id, suite })} /> : "not run"}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted">{SUITE_LABEL[suite].about}</p>
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
                  {metricsList.map((m) => {
                    const mA = suiteA?.metrics.find((x) => x.name === m.name);
                    const mB = suiteB?.metrics.find((x) => x.name === m.name);
                    const measured = (x?: typeof m) => x && x.n !== 0;
                    const delta = mA && mB && measured(mA) && measured(mB) ? improvement(mA, mB) : 0;
                    const problems = gate.data?.rows.find((r) => r.suite === suite && r.metric === m.name)?.problems ?? [];
                    return (
                      <tr key={m.name} title={problems.join("\n") || undefined}>
                        <td className="py-2.5">{m.name}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-2">{measured(mA) ? formatMetric(mA!) : "—"}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{measured(mB) ? formatMetric(mB!) : "—"}</td>
                        <td className={cn("py-2.5 text-right tabular-nums", delta > 0 ? "text-truth" : delta < 0 ? "text-bad" : "text-muted")}>
                          {!mA || !mB || delta === 0 ? "same" : `${delta > 0 ? "better" : "worse"} by ${formatDelta(m.unit, Math.abs(mB.value - mA.value))}`}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink-2">
                          {m.threshold === null ? "—" : `${m.better === "higher" ? "≥" : "≤"} ${formatMetric({ unit: m.unit, value: m.threshold })}`}
                        </td>
                        <td className="py-2.5 pl-4">
                          {mB ? (
                            <Icon name={mB.pass && problems.length === 0 ? "check" : "close"} className={mB.pass && problems.length === 0 ? "text-truth" : "text-bad"}
                              label={problems[0] ?? (mB.pass ? "Passes" : "Fails")} />
                          ) : "—"}
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
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Test marketplace</h2>
            <Badge tone="ai">Sample data until M9</Badge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[{ tag: "A", id: A, r: rangeA }, { tag: "B", id: B, r: rangeB }].map(({ tag, id, r }) => (
              <div key={tag} className="flex flex-col gap-1">
                <dt className="text-muted">{tag} · <span className="font-mono">{id}</span></dt>
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

      <CasesDialog target={cases} onClose={() => setCases(null)} />
    </div>
  );
}

function ResultNote({ result: r, onCases }: { result: EvalResult; onCases: () => void }) {
  return (
    <>
      {r.cases.toLocaleString()} cases · {formatDateTime(r.runAt)}
      {r.model && <span className="font-mono">· {r.model.split("/").pop()}</span>}
      {r.reusedFrom && <Badge tone="neutral">same as {r.reusedFrom}</Badge>}
      {r.stale && <Badge tone="bad">Out of date</Badge>}
      {r.partial && <Badge tone="bad">Partial</Badge>}
      {r.provider && r.provider !== "groq" && <Badge tone="bad">Sandbox model</Badge>}
      <button type="button" onClick={onCases} className="font-semibold text-ink underline-offset-2 hover:underline">cases</button>
    </>
  );
}

/** Each case's outcome in one suite, the first place to look when a metric moves. */
function CasesDialog({ target, onClose }: { target: { versionId: string; suite: EvalSuite } | null; onClose: () => void }) {
  const { data, isFetching } = useGetEvalCasesQuery(target ?? { versionId: "", suite: "intent_fidelity" }, { skip: !target });
  return (
    <Dialog open={!!target} onClose={onClose} title={target ? `${SUITE_LABEL[target.suite].title} · ${target.versionId}` : ""}>
      {isFetching || !data ? (
        <LoadingState />
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm">
          {data.map((c, i) => (
            <details key={String(c.id ?? i)} className="rounded-lg border border-line px-3 py-2">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <span className="font-mono text-xs">{String(c.id)}</span>
                <CaseVerdict c={c} />
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-surface-2 p-2 text-xs">{JSON.stringify(c, null, 1)}</pre>
            </details>
          ))}
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
        </div>
      )}
    </Dialog>
  );
}

function CaseVerdict({ c }: { c: Record<string, unknown> }) {
  let bad: string | null = null;
  if (Array.isArray(c.broader) && c.broader.length) bad = `broader: ${c.broader.join(", ")}`;
  else if (c.fields && Object.values(c.fields as Record<string, boolean>).some((v) => !v)) bad = "fields wrong";
  else if (typeof c.success === "boolean" && !c.success) bad = c.refused ? "refused by the gate" : c.wrongItem ? "wrong item" : "no cart";
  else if (typeof c.found === "number" && (c.found !== c.labels || (c.invented as number) > 0)) bad = `found ${c.found}/${c.labels}, invented ${c.invented}`;
  else if (typeof c.failed === "number" && c.failed > 0) bad = `${c.failed} failed`;
  return bad ? <Badge tone="bad">{bad}</Badge> : <Badge tone="truth">ok</Badge>;
}
