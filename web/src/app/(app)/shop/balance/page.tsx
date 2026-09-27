import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";

export const metadata: Metadata = { title: "Balance" };

export default function BalancePage() {
  return (
    <PlannedPage
      title="Balance"
      description="The money your AI shopper spends from."
      milestone="M2"
      planned={[
        "Available balance and holds for carts being paid",
        "Top-ups and payments to sellers",
      ]}
    />
  );
}
