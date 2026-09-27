"use client";

// M1 scaffolding: live reads for the seller, support, ops and admin pages.
// Replaced by the real screens in M3.

import { PreviewRow } from "@/components/layout/PlannedPage";
import { Money } from "@/components/ui";
import { useGetAgentVersionsQuery, useGetAllRunsQuery, useGetEvalResultsQuery, useGetOpsOverviewQuery, useGetRangeReportsQuery } from "@/features/agentops";
import { useGetMyCatalogQuery, useGetMyOrdersQuery, useGetMySellerProfileQuery, useGetSellersQuery } from "@/features/sellers";
import { useGetBlockedCartsQuery, useGetDisputesQuery } from "@/features/support";
import { Loading } from "./Loading";

export function SellerOrdersPreview() {
  const { data } = useGetMyOrdersQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((o) => (
        <PreviewRow key={o.id} label={`${o.shopperName} · ${o.summary}`} value={<Money amountMinor={o.totalMinor} />} />
      ))}
    </>
  );
}

export function SellerCatalogPreview() {
  const { data } = useGetMyCatalogQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((c) => (
        <PreviewRow key={c.sku} label={c.name} value={<Money amountMinor={c.unitPriceMinor} />} />
      ))}
    </>
  );
}

export function SellerAccountsPreview() {
  const { data } = useGetMySellerProfileQuery();
  if (!data) return <Loading />;
  return (
    <>
      <PreviewRow label="Registered name" value={data.legalName} />
      {data.accounts.map((a) => (
        <PreviewRow key={a.accountNumberMasked} label={`${a.bankName} ${a.accountNumberMasked}`} value={a.verifiedAt ? "Verified" : "Not verified"} />
      ))}
    </>
  );
}

export function BlockedCartsPreview() {
  const { data } = useGetBlockedCartsQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((b) => (
        <PreviewRow key={b.runId} label={`${b.shopperName} → ${b.sellerName}`} value={`${b.failedRules.length} failed`} />
      ))}
    </>
  );
}

export function DisputesPreview() {
  const { data } = useGetDisputesQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((d) => (
        <PreviewRow key={d.id} label={`${d.shopperName} · ${d.sellerName}`} value={d.status} />
      ))}
    </>
  );
}

export function SellersPreview() {
  const { data } = useGetSellersQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((s) => (
        <PreviewRow key={s.id} label={s.displayName} value={s.tier} />
      ))}
    </>
  );
}

export function OpsOverviewPreview() {
  const { data } = useGetOpsOverviewQuery();
  if (!data) return <Loading />;
  return (
    <>
      <PreviewRow label="Live agent version" value={data.liveVersion} />
      <PreviewRow label="Runs in 24 h" value={data.runsToday} />
      <PreviewRow label="Blocked in 24 h" value={data.blockedToday} />
      <PreviewRow label="Money out wrongly" value={data.violations} />
    </>
  );
}

export function AgentVersionsPreview() {
  const { data } = useGetAgentVersionsQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((v) => (
        <PreviewRow key={v.id} label={v.id} value={v.status} />
      ))}
    </>
  );
}

export function TracesPreview() {
  const { data } = useGetAllRunsQuery();
  if (!data) return <Loading />;
  return (
    <>
      <PreviewRow label="Runs recorded" value={data.length} />
      <PreviewRow label="Steps recorded" value={data.reduce((n, r) => n + r.steps.length, 0)} />
      <PreviewRow label="Model tokens" value={data.reduce((n, r) => n + r.totals.tokens, 0).toLocaleString("en-NG")} />
    </>
  );
}

export function EvalsPreview() {
  const { data } = useGetEvalResultsQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((e) => (
        <PreviewRow key={`${e.versionId}-${e.suite}`} label={`${e.versionId} · ${e.suite.replace("_", " ")}`} value={e.metrics.every((m) => m.pass) ? "Pass" : "Fail"} />
      ))}
    </>
  );
}

export function RangePreview() {
  const { data } = useGetRangeReportsQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((r) => {
        const runs = r.families.reduce((n, f) => n + f.runs, 0);
        const fooled = r.families.reduce((n, f) => n + f.fooled, 0);
        const violations = r.families.reduce((n, f) => n + f.violations, 0);
        return <PreviewRow key={r.versionId} label={r.versionId} value={`fooled ${((fooled / runs) * 100).toFixed(1)}% · ${violations} violations`} />;
      })}
    </>
  );
}
