import type { Metadata } from "next";
import { SellerOrders } from "@/features/sellers";

export const metadata: Metadata = { title: "Orders" };

export default function SellerPage() {
  return <SellerOrders />;
}
