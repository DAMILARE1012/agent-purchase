import type { Wallet } from "@/types/api";
import { api } from "@/store/api";

export const walletApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWallet: build.query<Wallet, void>({
      query: () => "wallet",
      providesTags: ["Wallet"],
    }),
  }),
});

export const { useGetWalletQuery } = walletApi;
