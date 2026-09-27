import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { OpsOverviewPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Overview" };

export default function OpsOverviewPage() {
  return (
    <PlannedPage
      title="Overview"
      description="How the AI shopper is doing right now."
      milestone="M3"
      planned={[
        "Runs, purchases and blocked carts",
        "Money out wrongly (must be zero)",
        "Queue depth, run time, cost per purchase, fallback rate",
      ]}
      preview={<OpsOverviewPreview />}
    />
  );
}
