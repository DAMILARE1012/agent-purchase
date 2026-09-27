import type { AgentRun, Purchase } from "@/types/domain";
import { api } from "@/store/api";

export const runsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getRuns: build.query<AgentRun[], { mandateId?: string } | void>({
      query: (args) => ({ url: "runs", params: args ?? undefined }),
      providesTags: (result) => [{ type: "Run", id: "LIST" }, ...(result ?? []).map((r) => ({ type: "Run" as const, id: r.id }))],
    }),
    /** Poll this (pollingInterval) while a run is queued or running. */
    getRun: build.query<AgentRun, string>({
      query: (id) => `runs/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Run", id }],
    }),
    startRun: build.mutation<AgentRun, { mandateId: string }>({
      query: (body) => ({ url: "runs", method: "POST", body }),
      invalidatesTags: (_r, _e, { mandateId }) => [{ type: "Run", id: "LIST" }, { type: "Mandate", id: mandateId }],
    }),
    approveCart: build.mutation<Purchase, { cartId: string; runId: string; mandateId: string }>({
      query: ({ cartId }) => ({ url: `carts/${cartId}/approve`, method: "POST" }),
      invalidatesTags: (_r, _e, { runId, mandateId }) => [
        { type: "Run", id: runId },
        { type: "Run", id: "LIST" },
        { type: "Mandate", id: mandateId },
        { type: "Mandate", id: "LIST" },
        { type: "Purchase", id: "LIST" },
        "Wallet",
      ],
    }),
    declineCart: build.mutation<AgentRun, { cartId: string; runId: string }>({
      query: ({ cartId }) => ({ url: `carts/${cartId}/decline`, method: "POST" }),
      invalidatesTags: (_r, _e, { runId }) => [{ type: "Run", id: runId }, { type: "Run", id: "LIST" }],
    }),
  }),
});

export const { useGetRunsQuery, useGetRunQuery, useStartRunMutation, useApproveCartMutation, useDeclineCartMutation } = runsApi;
