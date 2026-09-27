import type {
  CreateTransferRequest,
  CreateTransferResponse,
  PartySummary,
  StepUpRequest,
  Transfer,
  TransferDetail,
} from "@/types/api";
import { api } from "@/store/api";

const LIST = { type: "Transfer", id: "LIST" } as const;

export const transfersApi = api.injectEndpoints({
  endpoints: (build) => ({
    listTransfers: build.query<Transfer[], void>({
      query: () => "transfers",
      providesTags: [LIST],
    }),
    getTransfer: build.query<TransferDetail, string>({
      query: (tx) => `transfers/${tx}`,
      providesTags: (_r, _e, tx) => [{ type: "Transfer", id: tx }],
    }),
    listPeople: build.query<PartySummary[], void>({
      query: () => "users",
      providesTags: ["People"],
    }),
    createTransfer: build.mutation<CreateTransferResponse, CreateTransferRequest>({
      query: ({ idempotencyKey, ...body }) => ({
        url: "transfers",
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      invalidatesTags: ["Wallet", LIST],
    }),
    completeStepUp: build.mutation<Transfer, StepUpRequest>({
      query: ({ tx, code }) => ({ url: `transfers/${tx}/step-up`, method: "POST", body: { code } }),
      invalidatesTags: (_r, _e, { tx }) => ["Wallet", LIST, { type: "Transfer", id: tx }],
    }),
    confirmReceived: build.mutation<Transfer, string>({
      query: (tx) => ({ url: `transfers/${tx}/confirm`, method: "POST" }),
      invalidatesTags: (_r, _e, tx) => [LIST, { type: "Transfer", id: tx }],
    }),
    /** Sandbox only: simulate the payment rail settling or reversing a payment. */
    simulateRail: build.mutation<TransferDetail, { tx: string; action: "settle" | "reverse" }>({
      query: ({ tx, action }) => ({ url: `sandbox/transfers/${tx}/${action}`, method: "POST" }),
      invalidatesTags: (_r, _e, { tx }) => ["Wallet", LIST, { type: "Transfer", id: tx }, "Case", "Ledger"],
    }),
  }),
});

export const {
  useListTransfersQuery,
  useGetTransferQuery,
  useListPeopleQuery,
  useCreateTransferMutation,
  useCompleteStepUpMutation,
  useConfirmReceivedMutation,
  useSimulateRailMutation,
} = transfersApi;
