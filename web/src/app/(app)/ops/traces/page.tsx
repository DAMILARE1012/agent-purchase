import type { Metadata } from "next";
import { TracesList } from "@/features/agentops";

export const metadata: Metadata = { title: "Run traces" };

export default function OpsTracesPage() {
  return <TracesList />;
}
