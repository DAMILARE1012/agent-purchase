import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { DisputesPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Disputes" };

export default function DisputesPage() {
  return (
    <PlannedPage
      title="Disputes"
      description="Shoppers' disputes, settled from the evidence."
      milestone="M3"
      planned={[
        "Open and resolved disputes",
        "Evidence bundle: mandate, cart, gate decision, payment",
      ]}
      preview={<DisputesPreview />}
    />
  );
}
