import type { CaseSummary, OpenDisputeRequest } from "@/types/api";
import { api } from "@/store/api";

export const disputesApi = api.injectEndpoints({
  endpoints: (build) => ({
    openDispute: build.mutation<CaseSummary, OpenDisputeRequest>({
      query: (body) => ({ url: "disputes", method: "POST", body }),
      invalidatesTags: ["Case"],
    }),
  }),
});

export const { useOpenDisputeMutation } = disputesApi;
