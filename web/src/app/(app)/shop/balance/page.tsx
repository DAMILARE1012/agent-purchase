import type { Metadata } from "next";
import { BalanceView } from "@/features/balance";

export const metadata: Metadata = { title: "Balance" };

export default function BalanceViewPage() {
  return <BalanceView />;
}
