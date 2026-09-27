import type { BlockedCart, Dispute, ResolveDisputeRequest } from "@/types/domain";
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
    resolveDispute: build.mutation<Dispute, { id: string } & ResolveDisputeRequest>({
      query: ({ id, ...body }) => ({ url: `support/disputes/${id}/resolve`, method: "POST", body }),
      invalidatesTags: [{ type: "Support", id: "DISPUTES" }, { type: "Purchase", id: "LIST" }],
    }),
  }),
});

export const { useGetBlockedCartsQuery, useGetDisputesQuery, useResolveDisputeMutation } = supportApi;
