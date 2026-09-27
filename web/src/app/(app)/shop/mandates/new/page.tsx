import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";

export const metadata: Metadata = { title: "New mandate" };

export default function NewMandatePage() {
  return (
    <PlannedPage
      title="New mandate"
      description="Say what you want; review the exact limits; approve with your passkey."
      milestone="M2"
      planned={[
        "A sentence box, e.g. “HP 107a toner, under ₦40,000, verified seller, by Friday”",
        "Qwen's draft as an editable form with exact values",
        "Questions for anything missing, with the strictest defaults until answered",
        "Passkey approval over the exact form",
      ]}
    />
  );
}
