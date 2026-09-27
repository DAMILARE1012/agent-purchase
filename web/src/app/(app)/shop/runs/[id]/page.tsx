import type { Metadata } from "next";
import { RunView } from "@/features/runs";

export const metadata: Metadata = { title: "AI shopping run" };

export default async function RunViewPage({ params }: PageProps<"/shop/runs/[id]">) {
  const { id } = await params;
  return <RunView runId={id} />;
}
