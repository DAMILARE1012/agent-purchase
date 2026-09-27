import type { DemoScenario, ScanRequest, ScanResult } from "@/types/api";
import { api } from "@/store/api";

/** Shared cache key so every component on the verify page sees the same scan. */
export const SCAN_CACHE_KEY = "receipt-scan";

export const verifyApi = api.injectEndpoints({
  endpoints: (build) => ({
    scanReceipt: build.mutation<ScanResult, ScanRequest>({
      query: (body) => ({ url: "scans", method: "POST", body }),
      invalidatesTags: ["Case"],
    }),
    getDemoScenarios: build.query<DemoScenario[], void>({
      query: () => "sandbox/scenarios",
    }),
    resetDemo: build.mutation<{ ok: boolean }, void>({
      query: () => ({ url: "sandbox/reset", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(api.util.resetApiState());
        } catch {
          // The component shows the error.
        }
      },
    }),
  }),
});

export const { useScanReceiptMutation, useGetDemoScenariosQuery, useResetDemoMutation } = verifyApi;
