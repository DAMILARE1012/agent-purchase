import type { Metadata } from "next";
import { MemberDashboard } from "@/features/wallet";

export const metadata: Metadata = { title: "Overview" };

export default function WalletPage() {
  return <MemberDashboard />;
}
