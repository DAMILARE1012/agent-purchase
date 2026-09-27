import type { CatalogItem, Seller, SellerOrder, SellerTier } from "@/types/domain";
import { api } from "@/store/api";

export const sellersApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The seller directory (support and admin). */
    getSellers: build.query<Seller[], void>({
      query: () => "sellers",
      providesTags: [{ type: "Seller", id: "LIST" }],
    }),
    getSeller: build.query<Seller, string>({
      query: (id) => `sellers/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Seller", id }],
    }),
    getSellerCatalog: build.query<CatalogItem[], string>({
      query: (id) => `sellers/${id}/catalog`,
    }),
    // The signed-in seller's own workspace.
    getMySellerProfile: build.query<Seller, void>({
      query: () => "seller/profile",
      providesTags: [{ type: "Seller", id: "ME" }],
    }),
    getMyCatalog: build.query<CatalogItem[], void>({
      query: () => "seller/catalog",
    }),
    getMyOrders: build.query<SellerOrder[], void>({
      query: () => "seller/orders",
      providesTags: [{ type: "Purchase", id: "LIST" }],
    }),
    setSellerTier: build.mutation<Seller, { id: string; tier: SellerTier }>({
      query: ({ id, tier }) => ({ url: `admin/sellers/${id}/tier`, method: "POST", body: { tier } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Seller", id }, { type: "Seller", id: "LIST" }],
    }),
  }),
});

export const {
  useGetSellersQuery,
  useGetSellerQuery,
  useGetSellerCatalogQuery,
  useGetMySellerProfileQuery,
  useGetMyCatalogQuery,
  useGetMyOrdersQuery,
  useSetSellerTierMutation,
} = sellersApi;
