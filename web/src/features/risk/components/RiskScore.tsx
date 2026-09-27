import { Badge } from "@/components/ui";

export function RiskScore({ score }: { score: number | null }) {
  if (score === null) return <Badge>No score</Badge>;
  const tone = score >= 0.8 ? "bad" : score >= 0.4 ? "ai" : "neutral";
  return <Badge tone={tone}>Risk {score.toFixed(2)}</Badge>;
}
