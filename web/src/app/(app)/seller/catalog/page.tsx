import type { Metadata } from "next";
import { SellerCatalog } from "@/features/sellers";

export const metadata: Metadata = { title: "Catalog" };

export default function SellerCatalogPage() {
  return <SellerCatalog />;
}
