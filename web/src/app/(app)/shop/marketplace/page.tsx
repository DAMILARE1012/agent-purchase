import type { Metadata } from "next";
import { MarketplaceView } from "@/features/marketplace";

export const metadata: Metadata = { title: "Marketplace" };

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  return <MarketplaceView initialQuery={typeof q === "string" ? q : ""} />;
}
