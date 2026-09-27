import type { CaseDecision, CaseDetail, CaseSummary } from "@/types/api";
import { api } from "@/store/api";

const LIST = { type: "Case", id: "LIST" } as const;

export const riskApi = api.injectEndpoints({
  endpoints: (build) => ({
    listCases: build.query<CaseSummary[], void>({
      query: () => "cases",
      providesTags: [LIST, "Case"],
    }),
    getCase: build.query<CaseDetail, string>({
      query: (id) => `cases/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Case", id }],
    }),
    decideCase: build.mutation<CaseDetail, { id: string; decision: CaseDecision }>({
      query: ({ id, decision }) => ({ url: `cases/${id}/decision`, method: "POST", body: { decision } }),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: "Case", id }, "Wallet", { type: "Transfer", id: "LIST" }],
    }),
  }),
});

export const { useListCasesQuery, useGetCaseQuery, useDecideCaseMutation } = riskApi;
