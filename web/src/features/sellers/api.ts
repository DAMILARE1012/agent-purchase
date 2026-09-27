import type { CatalogItem, RegisterAccountRequest, Seller, SellerOrder, SellerTier } from "@/types/domain";
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
    refundOrder: build.mutation<SellerOrder, string>({
      query: (orderId) => ({ url: `seller/orders/${orderId}/refund`, method: "POST" }),
      invalidatesTags: [{ type: "Purchase", id: "LIST" }],
    }),
    /** Registers a settlement account; verified only if the bank's name matches the seller's legal name. */
    registerAccount: build.mutation<Seller, RegisterAccountRequest>({
      query: (body) => ({ url: "seller/accounts", method: "POST", body }),
      invalidatesTags: [{ type: "Seller", id: "ME" }, { type: "Seller", id: "LIST" }],
    }),
    removeAccount: build.mutation<Seller, { bankCode: string; accountNumber: string }>({
      query: ({ bankCode, accountNumber }) => ({ url: `seller/accounts/${bankCode}/${accountNumber}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Seller", id: "ME" }, { type: "Seller", id: "LIST" }],
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
  useRefundOrderMutation,
  useRegisterAccountMutation,
  useRemoveAccountMutation,
  useSetSellerTierMutation,
} = sellersApi;
