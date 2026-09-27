import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { BlockedCartsPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Blocked carts" };

export default function BlockedCartsPage() {
  return (
    <PlannedPage
      title="Blocked carts"
      description="Carts the gate refused, with the reasons."
      milestone="M3"
      planned={[
        "Every refused cart, the rules it broke and the seller",
        "The run's trace, with personal details masked",
        "Flag a seller for review",
      ]}
      preview={<BlockedCartsPreview />}
    />
  );
}
