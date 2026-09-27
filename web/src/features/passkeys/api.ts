import { api } from "@/store/api";

export interface PasskeySummary {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebAuthnOptions {
  challengeId: string;
  publicKey: Record<string, unknown>;
}

export const passkeysApi = api.injectEndpoints({
  endpoints: (build) => ({
    getPasskeys: build.query<PasskeySummary[], void>({
      query: () => "passkeys",
      providesTags: [{ type: "Session", id: "PASSKEYS" }],
    }),
    passkeyRegistrationOptions: build.mutation<WebAuthnOptions, void>({
      query: () => ({ url: "passkeys/registration-options", method: "POST" }),
    }),
    registerPasskey: build.mutation<PasskeySummary, { challengeId: string; credential: Record<string, unknown>; name: string }>({
      query: (body) => ({ url: "passkeys", method: "POST", body }),
      invalidatesTags: [{ type: "Session", id: "PASSKEYS" }],
    }),
    removePasskey: build.mutation<void, number>({
      query: (id) => ({ url: `passkeys/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Session", id: "PASSKEYS" }],
    }),
  }),
});

export const { useGetPasskeysQuery, usePasskeyRegistrationOptionsMutation, useRegisterPasskeyMutation, useRemovePasskeyMutation } = passkeysApi;
