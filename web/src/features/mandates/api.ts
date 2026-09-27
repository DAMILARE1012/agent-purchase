import type { CreateMandateRequest, DraftMandateRequest, Mandate, MandateDraft } from "@/types/domain";
import { api } from "@/store/api";

export const mandatesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMandates: build.query<Mandate[], void>({
      query: () => "mandates",
      providesTags: (result) => [{ type: "Mandate", id: "LIST" }, ...(result ?? []).map((m) => ({ type: "Mandate" as const, id: m.id }))],
    }),
    getMandate: build.query<Mandate, string>({
      query: (id) => `mandates/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Mandate", id }],
    }),
    /** Qwen drafts the limits from the shopper's sentence (intent.compile). */
    draftMandate: build.mutation<MandateDraft, DraftMandateRequest>({
      query: (body) => ({ url: "mandates/draft", method: "POST", body }),
    }),
    createMandate: build.mutation<Mandate, CreateMandateRequest>({
      query: (body) => ({ url: "mandates", method: "POST", body }),
      invalidatesTags: [{ type: "Mandate", id: "LIST" }],
    }),
    revokeMandate: build.mutation<Mandate, string>({
      query: (id) => ({ url: `mandates/${id}/revoke`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [{ type: "Mandate", id }, { type: "Mandate", id: "LIST" }, { type: "Run", id: "LIST" }],
    }),
  }),
});

export const {
  useGetMandatesQuery,
  useGetMandateQuery,
  useDraftMandateMutation,
  useCreateMandateMutation,
  useRevokeMandateMutation,
} = mandatesApi;
