import type { Metadata } from "next";
import { NewMandateFlow } from "@/features/mandates";

export const metadata: Metadata = { title: "New mandate" };

export default function NewMandateFlowPage() {
  return <NewMandateFlow />;
}
