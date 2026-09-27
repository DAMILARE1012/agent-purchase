import type { Metadata } from "next";
import { Disputes } from "@/features/support";

export const metadata: Metadata = { title: "Disputes" };

export default function SupportDisputesPage() {
  return <Disputes />;
}
