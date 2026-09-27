import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { RangePreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Test marketplace" };

export default function RangePage() {
  return (
    <PlannedPage
      title="Test marketplace"
      description="How often dishonest sellers fool the AI, and proof that no money went out wrongly."
      milestone="M3"
      planned={[
        "Fooled rate per attack type, per version and model",
        "Money-out-wrongly count (must be zero)",
      ]}
      preview={<RangePreview />}
    />
  );
}
