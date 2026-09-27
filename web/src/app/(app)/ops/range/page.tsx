import type { Metadata } from "next";
import { RangeReportView } from "@/features/agentops";

export const metadata: Metadata = { title: "Test marketplace" };

export default function OpsRangePage() {
  return <RangeReportView />;
}
