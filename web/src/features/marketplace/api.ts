import type { SellerTier } from "@/types/domain";
import { api } from "@/store/api";

export interface MarketSeller {
  id: string;
  name: string;
  tier: SellerTier;
  city: string;
  category: string;
  catalogKind: "structured" | "images" | "mixed";
  deliveryFeeMinor: number | null;
  deliveryDays: number | null;
  joinedAt: string | null;
}

export interface MarketOffer {
  sellerId: string;
  sku: string;
  name: string;
  packSize: number;
  unitPriceMinor: number;
  inStock: boolean;
  /** The seller's own words: untrusted, shown as a quote. */
  description: string | null;
}

/** The same product (brand and model) from every seller that lists it. */
export interface MarketProduct {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  offers: MarketOffer[];
  /** Sellers whose photo catalogs say they show this product; only reading the photo can confirm. */
  inPhotos: string[];
}

export interface MarketPhoto {
  sellerId: string;
  page: number;
  /** What the seller says the photo shows. */
  caption: string;
  topics: string[];
  /** Path under the API: the photo is served by the platform. */
  src: string;
}

export interface Marketplace {
  sellers: Record<string, MarketSeller>;
  products: MarketProduct[];
  photos: MarketPhoto[];
}

export const marketplaceApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMarketplace: build.query<Marketplace, void>({
      query: () => "marketplace",
      keepUnusedDataFor: 120,
    }),
  }),
});

export const { useGetMarketplaceQuery } = marketplaceApi;
