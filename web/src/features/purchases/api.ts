import type { Purchase, ReceiptVerification } from "@/types/domain";
import { api } from "@/store/api";

export const purchasesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getPurchases: build.query<Purchase[], void>({
      query: () => "purchases",
      providesTags: [{ type: "Purchase", id: "LIST" }],
    }),
    getPurchase: build.query<Purchase, string>({
      query: (id) => `purchases/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Purchase", id }],
    }),
    /** Public: anyone holding a receipt can check it. */
    verifyReceipt: build.query<ReceiptVerification, string>({
      query: (token) => ({ url: "receipts/verify", params: { token } }),
    }),
  }),
});

export const { useGetPurchasesQuery, useGetPurchaseQuery, useVerifyReceiptQuery } = purchasesApi;
