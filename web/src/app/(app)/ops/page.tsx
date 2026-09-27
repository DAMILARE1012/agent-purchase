import type { Metadata } from "next";
import { OpsOverview } from "@/features/agentops";

export const metadata: Metadata = { title: "Overview" };

export default function OpsPage() {
  return <OpsOverview />;
}
