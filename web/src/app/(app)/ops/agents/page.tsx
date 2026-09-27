import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { AgentVersionsPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Agent versions" };

export default function AgentVersionsPage() {
  return (
    <PlannedPage
      title="Agent versions"
      description="Prompts, model and settings, released together."
      milestone="M3"
      planned={[
        "Live, candidate and retired versions",
        "Prompt versions per task, model, fallback and parameters",
        "Changelog",
      ]}
      preview={<AgentVersionsPreview />}
    />
  );
}
