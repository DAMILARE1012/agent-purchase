import type { RefundRequest, Transfer } from "@/types/api";
import { api } from "@/store/api";

export const refundsApi = api.injectEndpoints({
  endpoints: (build) => ({
    refundPayment: build.mutation<Transfer, RefundRequest>({
      query: ({ tx, amountMinor, idempotencyKey }) => ({
        url: `transfers/${tx}/refund`,
        method: "POST",
        body: { amountMinor },
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      invalidatesTags: (_r, _e, { tx }) => ["Wallet", { type: "Transfer", id: "LIST" }, { type: "Transfer", id: tx }],
    }),
  }),
});

export const { useRefundPaymentMutation } = refundsApi;
