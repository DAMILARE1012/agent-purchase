import type { Metadata } from "next";
import { PurchasesList } from "@/features/purchases";

export const metadata: Metadata = { title: "Purchases" };

export default function PurchasesListPage() {
  return <PurchasesList />;
}
