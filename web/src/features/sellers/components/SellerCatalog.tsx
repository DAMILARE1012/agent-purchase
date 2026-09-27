"use client";

import { Alert, Badge, EmptyState, ErrorState, LoadingState, Money, PageHeader, StatTile } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { useGetMyCatalogQuery, useGetMySellerProfileQuery } from "../api";
import { SourceBadge } from "./SellerBits";

/** What AI shoppers see when they browse this store. */
export function SellerCatalog() {
  const { data: items, error, isLoading } = useGetMyCatalogQuery();
  const { data: profile } = useGetMySellerProfileQuery();
  const fromPhotos = items?.filter((i) => i.source === "image").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={profile?.displayName}
        title="Catalog"
        description="What AI shoppers can find and buy from you. Structured listings are read as they are; photo catalogs are read by Qwen."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : !items?.length ? (
        <EmptyState title="No products yet" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Products" value={items.length} />
            <StatTile label="Read from photos" value={fromPhotos} detail="Flyers and price lists" />
            <StatTile label="In stock" value={items.filter((i) => i.inStock).length} />
          </div>
          {fromPhotos > 0 && (
            <Alert tone="ai" title="Check what Qwen read from your photos">
              Prices and pack sizes read from a photo can be wrong. Shoppers are only ever charged what your signed cart says, so correct
              anything here before it reaches a cart. Editing arrives with the seller service in M4.
            </Alert>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Brand and model</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Pack</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.sku}>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{i.name}</span>
                      <span className="block font-mono text-xs text-muted">{i.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{[i.brand, i.model].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{i.packSize}</td>
                    <td className="px-4 py-3 text-right font-semibold"><Money amountMinor={i.unitPriceMinor} /></td>
                    <td className="px-4 py-3"><SourceBadge source={i.source} /></td>
                    <td className="px-4 py-3">{i.inStock ? <Badge tone="truth">In stock</Badge> : <Badge>Out</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
