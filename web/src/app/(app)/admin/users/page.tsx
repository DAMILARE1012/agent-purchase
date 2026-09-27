import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return (
    <PlannedPage
      title="Users"
      description="People on the platform and their roles."
      milestone="M3"
      planned={[
        "Users by role",
        "Suspend or restore a shopper",
      ]}
    />
  );
}
