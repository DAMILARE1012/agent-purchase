import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { PurchasesPreview } from "@/features/previews/ShopperPreviews";

export const metadata: Metadata = { title: "Purchases" };

export default function PurchasesPage() {
  return (
    <PlannedPage
      title="Purchases"
      description="What was bought, from whom, and the signed receipt."
      milestone="M2"
      planned={[
        "Purchases with seller, amount and status",
        "Signed receipt with its QR code for the seller",
      ]}
      preview={<PurchasesPreview />}
    />
  );
}
