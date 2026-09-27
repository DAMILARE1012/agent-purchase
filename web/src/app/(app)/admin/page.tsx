import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { SellersPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Sellers" };

export default function AdminSellersPage() {
  return (
    <PlannedPage
      title="Sellers"
      description="Verify sellers, set tiers and suspend."
      milestone="M3"
      planned={[
        "Seller directory with tiers",
        "Verification of legal names and bank accounts",
        "Suspensions",
      ]}
      preview={<SellersPreview />}
    />
  );
}
