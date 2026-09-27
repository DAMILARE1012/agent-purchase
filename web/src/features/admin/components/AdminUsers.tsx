"use client";

import { useState } from "react";
import { Alert, Badge, Button, ErrorState, LoadingState, PageHeader, SegmentedControl } from "@/components/ui";
import { ROLE_LABEL } from "@/components/layout/navigation";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { formatDate, formatRelative } from "@/lib/dates";
import { useNow } from "@/lib/useNow";
import { useAppDispatch } from "@/store/hooks";
import type { AdminUser } from "@/types/domain";
import { useGetUsersQuery, useSetUserStatusMutation } from "../api";

type Filter = "all" | AdminUser["role"];

/** People on the platform, their roles, and suspension. Roles themselves are managed in Keycloak. */
export function AdminUsers() {
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useGetUsersQuery();
  const [setStatus, setting] = useSetUserStatusMutation();
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow();
  const users = data ?? [];

  async function toggle(u: AdminUser) {
    const next = u.status === "active" ? "suspended" : "active";
    const res = await setStatus({ id: u.id, status: next });
    if ("data" in res) dispatch(notify(next === "suspended" ? `${u.displayName} is suspended.` : `${u.displayName} is active again.`));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="People on the platform and their roles. Roles are assigned in Keycloak; suspensions are recorded here and enforced once the backend owns users (M4 onward)."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <SegmentedControl
            label="Role"
            value={filter}
            onChange={setFilter}
            options={(["all", "shopper", "seller", "analyst", "ops", "admin"] as Filter[]).map((r) => ({
              value: r,
              label: r === "all" ? "All" : ROLE_LABEL[r],
              count: r === "all" ? users.length : users.filter((u) => u.role === r).length,
            }))}
          />
          {setting.error && <Alert tone="bad">{errorMessage(setting.error)}</Alert>}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5 font-semibold">Last seen</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.filter((u) => filter === "all" || u.role === filter).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{u.displayName}</span>
                      <span className="block font-mono text-xs text-muted">@{u.username}</span>
                    </td>
                    <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                    <td className="px-4 py-3 text-ink-2">{formatDate(u.joinedAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{formatRelative(u.lastSeenAt, now)}</td>
                    <td className="px-4 py-3">{u.status === "active" ? <Badge tone="truth">Active</Badge> : <Badge tone="bad">Suspended</Badge>}</td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== "admin" && (
                        <Button size="sm" variant={u.status === "active" ? "secondary" : "primary"} onClick={() => toggle(u)} disabled={setting.isLoading}>
                          {u.status === "active" ? "Suspend" : "Restore"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
