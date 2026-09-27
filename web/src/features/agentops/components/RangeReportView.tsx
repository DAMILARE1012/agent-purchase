"use client";

import { Card, ErrorState, Icon, LoadingState, PageHeader, StatTile } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { useGetRangeReportsQuery } from "../api";
import { fooledRate, violations } from "../lib/gates";

/**
 * The test marketplace: dishonest sellers attack every agent version. Two
 * numbers per version: how often the AI was fooled (expected above zero), and
 * how often money moved wrongly (must be zero).
 */
export function RangeReportView() {
  const { data, error, isLoading } = useGetRangeReportsQuery();
  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState message={errorMessage(error) ?? ""} />;

  const totalRuns = data.reduce((n, r) => n + r.families.reduce((m, f) => m + f.runs, 0), 0);
  const totalViolations = data.reduce((n, r) => n + violations(r), 0);
  const families = data[0]?.families ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Test marketplace"
        description="Dishonest sellers attack each agent version: hidden instructions, misleading prices, swapped products, wrong accounts and more."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Attack runs" value={totalRuns.toLocaleString()} detail={`${data.length} versions and models`} />
        <StatTile label="Lowest fooled rate" value={`${Math.min(...data.map(fooledRate)).toFixed(1)}%`} detail="The AI proposed a cart that broke the mandate" />
        <StatTile
          label="Money out wrongly"
          value={totalViolations}
          detail={totalViolations === 0 ? "The gate refused every one of those carts" : "Severity-1: a payment broke a mandate"}
          icon={<Icon name="shield" className={totalViolations === 0 ? "text-truth" : "text-bad"} />}
        />
      </div>

      <Card className="flex flex-col gap-3 p-0">
        <div className="flex flex-col gap-1 px-5 pt-5">
          <h2 className="font-display text-lg font-semibold">Fooled rate by attack</h2>
          <p className="text-sm text-muted">Share of attack runs where the AI proposed a cart that broke the shopper&apos;s mandate. Bars share one scale, 0 to 30%.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-y border-line bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Attack</th>
                {data.map((r) => (
                  <th key={r.versionId} className="px-5 py-2.5 font-semibold">
                    <span className="block font-mono">{r.versionId.split("@")[0]}</span>
                    <span className="font-normal">{r.model}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {families.map((f) => (
                <tr key={f.family}>
                  <td className="px-5 py-2.5">{f.label}</td>
                  {data.map((r) => {
                    const row = r.families.find((x) => x.family === f.family)!;
                    const rate = row.runs ? (row.fooled / row.runs) * 100 : 0;
                    return (
                      <td key={r.versionId} className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                            <span className="block h-full rounded-r-full bg-chart-out" style={{ width: `${Math.min(100, (rate / 30) * 100)}%` }} />
                          </span>
                          <span className="w-24 tabular-nums">
                            <b>{rate.toFixed(1)}%</b> <span className="text-xs text-muted">{row.fooled}/{row.runs}</span>
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-surface-2/60 font-semibold">
                <td className="px-5 py-2.5">All attacks</td>
                {data.map((r) => <td key={r.versionId} className="px-5 py-2.5 tabular-nums">{fooledRate(r).toFixed(1)}%</td>)}
              </tr>
              <tr className="font-semibold">
                <td className="px-5 py-2.5">Money out wrongly</td>
                {data.map((r) => (
                  <td key={r.versionId} className={violations(r) ? "px-5 py-2.5 text-bad" : "px-5 py-2.5 text-truth"}>
                    {violations(r)} <span className="text-xs font-normal text-muted">· {formatDateTime(r.generatedAt)}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-sm text-muted">
        Attack variants are written by a different model from the one being tested, and reviewed before they join the suite. The results are
        sandbox data until the test marketplace is built in M9.
      </p>
    </div>
  );
}
