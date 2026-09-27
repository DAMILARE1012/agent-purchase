import type { Metadata } from "next";
import { AdminUsers } from "@/features/admin";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return <AdminUsers />;
}
