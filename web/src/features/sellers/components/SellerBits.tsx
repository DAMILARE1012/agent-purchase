import { Badge, type Tone } from "@/components/ui";
import type { CatalogItem, SellerTier } from "@/types/domain";

export const TIER: Record<SellerTier, { label: string; tone: Tone; meaning: string }> = {
  verified: { label: "Verified", tone: "truth", meaning: "Legal name and bank account checked" },
  known: { label: "Known", tone: "neutral", meaning: "Trading history, not fully verified" },
  new: { label: "New", tone: "ai", meaning: "Recently joined; not paid unless a shopper allows it" },
  suspended: { label: "Suspended", tone: "bad", meaning: "Can't be paid" },
};

export function SellerTierBadge({ tier }: { tier: SellerTier }) {
  return <Badge tone={TIER[tier].tone}>{TIER[tier].label}</Badge>;
}

export function SourceBadge({ source }: { source: CatalogItem["source"] }) {
  return source === "image" ? <Badge tone="ai">Read from a photo</Badge> : <Badge>Structured</Badge>;
}
