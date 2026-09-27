import type { AdminUser } from "@/types/domain";
import { api } from "@/store/api";

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    getUsers: build.query<AdminUser[], void>({
      query: () => "admin/users",
      providesTags: [{ type: "Admin", id: "USERS" }],
    }),
    setUserStatus: build.mutation<AdminUser, { id: string; status: AdminUser["status"] }>({
      query: ({ id, status }) => ({ url: `admin/users/${id}/status`, method: "POST", body: { status } }),
      invalidatesTags: [{ type: "Admin", id: "USERS" }],
    }),
  }),
});

export const { useGetUsersQuery, useSetUserStatusMutation } = adminApi;
