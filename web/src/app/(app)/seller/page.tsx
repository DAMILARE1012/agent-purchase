import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { SellerOrdersPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Orders" };

export default function SellerOrdersPage() {
  return (
    <PlannedPage
      title="Orders"
      description="Purchases paid to your store by shoppers' AI agents."
      milestone="M3"
      planned={[
        "Orders to fulfil, with delivery dates",
        "Each order's signed receipt and mandate evidence",
        "Refunds",
      ]}
      preview={<SellerOrdersPreview />}
    />
  );
}
