import type { Metadata } from "next";
import { SellerAccounts } from "@/features/sellers";

export const metadata: Metadata = { title: "Bank accounts" };

export default function SellerAccountsPage() {
  return <SellerAccounts />;
}
