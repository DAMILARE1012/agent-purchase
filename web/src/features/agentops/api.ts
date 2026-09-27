import type { AgentRun, AgentVersion, EvalResult, OpsOverview, RangeReport } from "@/types/domain";
import { api } from "@/store/api";

export const agentOpsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getOpsOverview: build.query<OpsOverview, void>({
      query: () => "ops/overview",
      providesTags: [{ type: "Ops", id: "OVERVIEW" }],
    }),
    /** Every shopper's runs, for traces. */
    getAllRuns: build.query<AgentRun[], void>({
      query: () => "ops/runs",
      providesTags: [{ type: "Run", id: "LIST" }],
    }),
    getAgentVersions: build.query<AgentVersion[], void>({
      query: () => "ops/agent-versions",
      providesTags: [{ type: "Ops", id: "VERSIONS" }],
    }),
    getEvalResults: build.query<EvalResult[], { versionId?: string } | void>({
      query: (args) => ({ url: "ops/evals", params: args ?? undefined }),
      providesTags: [{ type: "Ops", id: "EVALS" }],
    }),
    getRangeReports: build.query<RangeReport[], void>({
      query: () => "ops/range",
      providesTags: [{ type: "Ops", id: "RANGE" }],
    }),
  }),
});

export const {
  useGetOpsOverviewQuery,
  useGetAllRunsQuery,
  useGetAgentVersionsQuery,
  useGetEvalResultsQuery,
  useGetRangeReportsQuery,
} = agentOpsApi;
