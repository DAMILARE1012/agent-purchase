import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { TracesPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Run traces" };

export default function TracesPage() {
  return (
    <PlannedPage
      title="Run traces"
      description="Every model call and tool call, step by step."
      milestone="M3"
      planned={[
        "Runs across all shoppers",
        "Per step: model, tokens, time, cost, seller content and injection score",
        "Why the gate decided what it did",
      ]}
      preview={<TracesPreview />}
    />
  );
}
