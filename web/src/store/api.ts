import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * The single RTK Query API. Each feature adds its endpoints with
 * `api.injectEndpoints` in its own `api.ts`, so this file stays small.
 *
 * Requests go to the Next.js backend-for-frontend at /api/v1, which adds the
 * signed-in user's access token and forwards them to the FastAPI service.
 * The browser never sees tokens; the session cookie is httpOnly.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1",
    credentials: "include",
  }),
  tagTypes: ["Session", "Wallet", "Transfer", "People", "Case", "Ledger"],
  endpoints: () => ({}),
});
