import type { Metadata } from "next";
import { RunsList } from "@/features/runs";

export const metadata: Metadata = { title: "AI shopping" };

export default function RunsListPage() {
  return <RunsList />;
}
