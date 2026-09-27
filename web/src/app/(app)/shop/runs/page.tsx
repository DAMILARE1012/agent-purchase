import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { RunsPreview } from "@/features/previews/ShopperPreviews";

export const metadata: Metadata = { title: "AI shopping" };

export default function RunsPage() {
  return (
    <PlannedPage
      title="AI shopping"
      description="Watch the AI shop, and see why the gate allowed or refused each cart."
      milestone="M2"
      planned={[
        "Live timeline of the agent's steps (searches, catalog photos read, carts requested)",
        "The proposed cart beside your mandate's limits",
        "The gate's checks with ticks and crosses",
        "Approve or decline",
      ]}
      preview={<RunsPreview />}
    />
  );
}
