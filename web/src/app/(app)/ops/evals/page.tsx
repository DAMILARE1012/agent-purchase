import type { Metadata } from "next";
import { EvalComparison } from "@/features/agentops";

export const metadata: Metadata = { title: "Evaluations" };

/** ?a=<baseline>&b=<candidate> preselects the versions to compare. */
export default async function OpsEvalsPage({ searchParams }: PageProps<"/ops/evals">) {
  const { a, b } = await searchParams;
  return <EvalComparison initialA={typeof a === "string" ? a : undefined} initialB={typeof b === "string" ? b : undefined} />;
}
