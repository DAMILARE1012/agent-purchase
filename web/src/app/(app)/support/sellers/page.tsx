import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { SellersPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Sellers" };

export default function SupportSellersPage() {
  return (
    <PlannedPage
      title="Sellers"
      description="The seller directory, for investigations."
      milestone="M3"
      planned={[
        "Sellers by tier, with blocked-cart counts",
        "Registered accounts and names",
      ]}
      preview={<SellersPreview />}
    />
  );
}
