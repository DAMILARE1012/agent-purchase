import type { Metadata } from "next";
import { SellerDirectory } from "@/features/sellers";

export const metadata: Metadata = { title: "Sellers" };

export default function AdminPage() {
  return <SellerDirectory canManage />;
}
