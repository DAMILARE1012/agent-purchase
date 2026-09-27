import type { Wallet } from "@/types/api";
import { api } from "@/store/api";

/** The shopper's funding balance (real API: the ledger account from the previous product). */
export const balanceApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWallet: build.query<Wallet, void>({
      query: () => "wallet",
      providesTags: ["Wallet"],
    }),
  }),
});

export const { useGetWalletQuery } = balanceApi;
