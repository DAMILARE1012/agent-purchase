import type { Metadata } from "next";
import { NewMandateFlow } from "@/features/mandates";

export const metadata: Metadata = { title: "New mandate" };

/** `?request=` pre-fills the sentence (from the marketplace's "Ask the AI to buy this"). */
export default async function NewMandateFlowPage({ searchParams }: PageProps<"/shop/mandates/new">) {
  const { request } = await searchParams;
  return <NewMandateFlow initialRequest={typeof request === "string" ? request.slice(0, 500) : ""} />;
}
