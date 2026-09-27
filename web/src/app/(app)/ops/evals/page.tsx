import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { EvalsPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Evaluations" };

export default function EvalsPage() {
  return (
    <PlannedPage
      title="Evaluations"
      description="Test results per agent version; a worse version can't ship."
      milestone="M3"
      planned={[
        "Suites: mandate drafting, shopping tasks, catalog reading, gate properties",
        "Side-by-side comparison of two versions",
      ]}
      preview={<EvalsPreview />}
    />
  );
}
