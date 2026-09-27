import type { BlockedCart, Dispute } from "@/types/domain";
import { api } from "@/store/api";

export const supportApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBlockedCarts: build.query<BlockedCart[], void>({
      query: () => "support/blocked",
      providesTags: [{ type: "Support", id: "BLOCKED" }, { type: "Run", id: "LIST" }],
    }),
    getDisputes: build.query<Dispute[], void>({
      query: () => "support/disputes",
      providesTags: [{ type: "Support", id: "DISPUTES" }],
    }),
  }),
});

export const { useGetBlockedCartsQuery, useGetDisputesQuery } = supportApi;
