import type { Metadata } from "next";
import { MandatesList } from "@/features/mandates";

export const metadata: Metadata = { title: "Mandates" };

export default function MandatesListPage() {
  return <MandatesList />;
}
