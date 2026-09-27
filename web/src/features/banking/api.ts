import type { Bank, ExternalAccount, NameEnquiry, NameEnquiryRequest, SimulateInboundRequest } from "@/types/api";
import { api } from "@/store/api";

export const bankingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBanks: build.query<Bank[], void>({
      query: () => "banks",
      keepUnusedDataFor: 600,
    }),
    /** Name enquiry: who owns this account? Cached per bank + account number. */
    lookupAccount: build.query<NameEnquiry, NameEnquiryRequest>({
      query: (body) => ({ url: "name-enquiry", method: "POST", body }),
      keepUnusedDataFor: 300,
    }),
    getExternalAccounts: build.query<ExternalAccount[], void>({
      query: () => "sandbox/external-accounts",
      keepUnusedDataFor: 600,
    }),
    simulateInbound: build.mutation<{ sessionId: string; status: string }, SimulateInboundRequest>({
      query: (body) => ({ url: "sandbox/inbound", method: "POST", body }),
      invalidatesTags: ["Wallet", { type: "Transfer", id: "LIST" }, "Ledger"],
    }),
  }),
});

export const { useGetBanksQuery, useLookupAccountQuery, useGetExternalAccountsQuery, useSimulateInboundMutation } = bankingApi;
