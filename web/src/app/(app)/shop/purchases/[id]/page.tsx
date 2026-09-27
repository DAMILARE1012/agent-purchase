import type { Metadata } from "next";
import { PurchaseDetail } from "@/features/purchases";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchaseDetailPage({ params }: PageProps<"/shop/purchases/[id]">) {
  const { id } = await params;
  return <PurchaseDetail purchaseId={id} />;
}
