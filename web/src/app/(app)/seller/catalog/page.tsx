import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { SellerCatalogPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Catalog" };

export default function SellerCatalogPage() {
  return (
    <PlannedPage
      title="Catalog"
      description="What AI shoppers can find and buy from you."
      milestone="M3"
      planned={[
        "Products with brand, model, pack size and price",
        "Photo catalogs (flyers, price lists) and how Qwen read them",
      ]}
      preview={<SellerCatalogPreview />}
    />
  );
}
