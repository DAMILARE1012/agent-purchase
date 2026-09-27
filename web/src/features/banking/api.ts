import type { Bank, NameEnquiry, NameEnquiryRequest } from "@/types/api";
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
  }),
});

export const { useGetBanksQuery, useLookupAccountQuery } = bankingApi;
