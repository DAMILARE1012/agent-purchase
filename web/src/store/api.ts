import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { API_MOCKS } from "@/lib/demo";

/**
 * Requests go to the Next.js backend-for-frontend at /api/v1, which adds the
 * signed-in user's access token and forwards them to the FastAPI service.
 * The browser never sees tokens; the session cookie is httpOnly.
 */
const realBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1",
  credentials: "include",
});

/**
 * Endpoints the backend doesn't have yet are served by the mock API in
 * src/mocks (when NEXT_PUBLIC_API_MOCKS isn't "false"). Everything else goes
 * to the real API, so screens switch over with no code changes.
 */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  if (API_MOCKS) {
    const { handleMock } = await import("@/mocks/handlers");
    const mocked = await handleMock(args);
    if (mocked) return mocked as Awaited<ReturnType<typeof realBaseQuery>>;
  }
  return realBaseQuery(args, api, extra);
};

/**
 * The single RTK Query API. Each feature adds its endpoints with
 * `api.injectEndpoints` in its own `api.ts`, so this file stays small.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: ["Session", "Wallet", "Ledger", "Mandate", "Run", "Purchase", "Seller", "Support", "Ops", "Admin"],
  endpoints: () => ({}),
});
