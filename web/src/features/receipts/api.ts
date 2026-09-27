import type { Receipt } from "@/types/api";
import { api } from "@/store/api";

export const receiptsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getReceipt: build.query<Receipt, string>({
      query: (tx) => `transfers/${tx}/receipt`,
      providesTags: (_r, _e, tx) => [{ type: "Transfer", id: tx }],
    }),
  }),
});

export const { useGetReceiptQuery } = receiptsApi;
