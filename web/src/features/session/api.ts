import type { SessionInfo } from "@/types/api";
import { api } from "@/store/api";

export const sessionApi = api.injectEndpoints({
  endpoints: (build) => ({
    getSession: build.query<SessionInfo, void>({
      query: () => "me",
      providesTags: ["Session"],
    }),
  }),
});

export const { useGetSessionQuery } = sessionApi;
