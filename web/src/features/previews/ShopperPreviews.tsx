"use client";

// M1 scaffolding: small live reads that prove each shopper page's data is wired.
// Replaced by the real screens in M2.

import { PreviewRow } from "@/components/layout/PlannedPage";
import { Money } from "@/components/ui";
import { useGetMandatesQuery } from "@/features/mandates";
import { useGetPurchasesQuery } from "@/features/purchases";
import { useGetRunsQuery } from "@/features/runs";
import { Loading } from "./Loading";

export function ShopperHomePreview() {
  const mandates = useGetMandatesQuery();
  const runs = useGetRunsQuery();
  const purchases = useGetPurchasesQuery();
  if (!mandates.data || !runs.data || !purchases.data) return <Loading />;
  return (
    <>
      <PreviewRow label="Active mandates" value={mandates.data.filter((m) => m.status === "active").length} />
      <PreviewRow label="Carts waiting for you" value={runs.data.filter((r) => r.status === "awaiting_approval").length} />
      <PreviewRow label="Blocked by the gate" value={runs.data.filter((r) => r.status === "blocked").length} />
      <PreviewRow label="Spent through the AI" value={<Money amountMinor={purchases.data.reduce((n, p) => n + p.totalMinor, 0)} />} />
    </>
  );
}

export function MandatesPreview() {
  const { data } = useGetMandatesQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((m) => (
        <PreviewRow key={m.id} label={m.limits.item} value={m.status.replace("_", " ")} />
      ))}
    </>
  );
}

export function RunsPreview() {
  const { data } = useGetRunsQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((r) => (
        <PreviewRow key={r.id} label={r.cart?.sellerName ?? "No cart"} value={r.status.replace("_", " ")} />
      ))}
    </>
  );
}

export function PurchasesPreview() {
  const { data } = useGetPurchasesQuery();
  if (!data) return <Loading />;
  return (
    <>
      {data.map((p) => (
        <PreviewRow key={p.id} label={p.summary} value={<Money amountMinor={p.totalMinor} />} />
      ))}
    </>
  );
}
