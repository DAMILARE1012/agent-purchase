import type { Metadata } from "next";
import { AgentVersions } from "@/features/agentops";

export const metadata: Metadata = { title: "Agent versions" };

export default function OpsAgentsPage() {
  return <AgentVersions />;
}
