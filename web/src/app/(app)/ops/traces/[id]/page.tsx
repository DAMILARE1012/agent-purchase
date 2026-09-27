import type { Metadata } from "next";
import { RunTrace } from "@/features/agentops";

export const metadata: Metadata = { title: "Run trace" };

export default async function OpsTracePage({ params }: PageProps<"/ops/traces/[id]">) {
  const { id } = await params;
  return <RunTrace runId={id} backHref="/ops/traces" />;
}
