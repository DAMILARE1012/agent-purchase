import type { Metadata } from "next";
import { RunTrace } from "@/features/agentops";

export const metadata: Metadata = { title: "Run trace" };

export default async function SupportRunPage({ params }: PageProps<"/support/runs/[id]">) {
  const { id } = await params;
  return <RunTrace runId={id} masked backHref="/support" />;
}
