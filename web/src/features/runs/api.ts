import type { AgentRun, ApprovalMethods, CartApprovalOptions, EmailCodeSent, Purchase } from "@/types/domain";
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
    /** A WebAuthn challenge that commits to exactly this seller-signed cart. */
    /** Whether this cart can be approved with an email code as well as a passkey (and why not, when it can't). */
    getApprovalMethods: build.query<ApprovalMethods, string>({
      query: (cartId) => `carts/${cartId}/approval-methods`,
    }),
    /** Emails a one-time code that approves exactly this cart. */
    sendEmailCode: build.mutation<EmailCodeSent, string>({
      query: (cartId) => ({ url: `carts/${cartId}/email-code`, method: "POST" }),
    }),
    cartApprovalOptions: build.mutation<CartApprovalOptions, string>({
      query: (cartId) => ({ url: `carts/${cartId}/approval-options`, method: "POST" }),
    }),
    /** Pays: the gate runs again, then hold, bank transfer and signed receipt. Repeating it returns the same purchase. */
    approveCart: build.mutation<Purchase, { cartId: string; runId: string; mandateId: string; signature: CartApprovalSignature }>({
      query: ({ cartId, signature }) => ({ url: `carts/${cartId}/approve`, method: "POST", body: { signature } }),
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

type CartApprovalSignature =
  | { kind: "passkey"; challengeId: string; credential: Record<string, unknown> }
  | { kind: "email_code"; code: string };

export const {
  useGetRunsQuery,
  useGetRunQuery,
  useStartRunMutation,
  useCartApprovalOptionsMutation,
  useGetApprovalMethodsQuery,
  useSendEmailCodeMutation,
  useApproveCartMutation,
  useDeclineCartMutation,
} = runsApi;
