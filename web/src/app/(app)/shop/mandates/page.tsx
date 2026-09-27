import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { MandatesPreview } from "@/features/previews/ShopperPreviews";

export const metadata: Metadata = { title: "Mandates" };

export default function MandatesPage() {
  return (
    <PlannedPage
      title="Mandates"
      description="The limits you've signed for the AI shopper."
      milestone="M2"
      planned={[
        "Every mandate with its status, uses left and spending",
        "Detail: exact limits, runs under it, cancel",
      ]}
      preview={<MandatesPreview />}
    />
  );
}
