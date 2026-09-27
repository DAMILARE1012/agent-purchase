import type { AgentRun, AgentVersion, EvalResult, EvalSuite, GateVerdict, OpsOverview, RangeReport } from "@/types/domain";
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
    /** The release gate's verdict for candidate vs baseline: the same code CI runs. */
    getEvalGate: build.query<GateVerdict, { baseline: string; candidate: string }>({
      query: (params) => ({ url: "ops/evals/gate", params }),
      providesTags: [{ type: "Ops", id: "EVALS" }],
    }),
    /** Each case's result in one suite, for finding what went wrong. */
    getEvalCases: build.query<Array<Record<string, unknown>>, { versionId: string; suite: EvalSuite }>({
      query: ({ versionId, suite }) => `ops/evals/${encodeURIComponent(versionId)}/${suite}`,
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
  useGetEvalGateQuery,
  useGetEvalCasesQuery,
  useGetRangeReportsQuery,
} = agentOpsApi;
