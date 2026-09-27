import type { Metadata } from "next";
import { MandateDetail } from "@/features/mandates";

export const metadata: Metadata = { title: "Mandate" };

export default async function MandateDetailPage({ params }: PageProps<"/shop/mandates/[id]">) {
  const { id } = await params;
  return <MandateDetail mandateId={id} />;
}
