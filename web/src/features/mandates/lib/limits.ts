import type { Tone } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Mandate, MandateLimits, MandateStatus, SellerPolicy } from "@/types/domain";

export const STATUS: Record<MandateStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "truth" },
  used_up: { label: "Used", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Cancelled", tone: "bad" },
};

export const POLICY_LABEL: Record<SellerPolicy, string> = {
  verified_only: "Verified sellers only",
  verified_and_known: "Verified and known sellers",
  listed: "Only the sellers listed",
};

export interface LimitRow {
  field: keyof MandateLimits;
  label: string;
  value: string;
}

/**
 * The exact values a shopper approves, in the order they're shown everywhere
 * (review, mandate detail, cart approval). Never a summary: the design requires
 * people to approve exact values (system_design.md §3).
 */
export function limitRows(l: MandateLimits, mode: Mandate["mode"]): LimitRow[] {
  const rows: LimitRow[] = [
    { field: "item", label: "Item", value: l.item },
  ];
  if (l.brand || l.model) rows.push({ field: "model", label: "Brand and model", value: [l.brand, l.model].filter(Boolean).join(" ") });
  if (l.quantity > 1) rows.push({ field: "quantity", label: "Quantity", value: String(l.quantity) });
  rows.push({
    field: "maxTotalMinor",
    label: mode === "not_present" ? "Maximum per purchase" : "Maximum total",
    value: l.maxTotalMinor > 0 ? `${formatMoney(l.maxTotalMinor)} including delivery` : "Not set: nothing can be paid",
  });
  if (l.maxPerItemMinor !== null) rows.push({ field: "maxPerItemMinor", label: "Maximum per item", value: formatMoney(l.maxPerItemMinor) });
  if (l.periodCapMinor !== null && l.period) rows.push({ field: "periodCapMinor", label: `Cap per ${l.period}`, value: formatMoney(l.periodCapMinor) });
  rows.push(
    { field: "sellerPolicy", label: "Sellers", value: POLICY_LABEL[l.sellerPolicy] },
    { field: "deliverBy", label: "Deliver by", value: l.deliverBy ? formatDateTime(l.deliverBy) : "Any date" },
    { field: "maxUses", label: "Can be used", value: l.maxUses === 1 ? "Once" : `Up to ${l.maxUses} times` },
    { field: "expiresAt", label: "Expires", value: formatDateTime(l.expiresAt) },
    { field: "shareDelivery", label: "Shared with the seller", value: shareText(l.shareDelivery) },
  );
  return rows;
}

function shareText(s: MandateLimits["shareDelivery"]): string {
  const parts = [s.name && "name", s.phone && "phone number", s.address && "delivery address"].filter(Boolean);
  return parts.length ? capitalise(parts.join(", ")) : "Nothing";
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the spending meter measures: this period against the cap for standing mandates, otherwise everything against the limit. */
export function spendLimit(m: Mandate): { spentMinor: number; limitMinor: number; label: string } {
  if (m.limits.periodCapMinor && m.limits.period) {
    return { spentMinor: m.periodSpentMinor ?? 0, limitMinor: m.limits.periodCapMinor, label: `this ${m.limits.period}` };
  }
  return { spentMinor: m.spentMinor, limitMinor: m.limits.maxTotalMinor * m.limits.maxUses, label: m.limits.maxUses > 1 ? "in total" : "limit" };
}

/** Deterministic JSON (sorted keys) so the same limits always hash the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of the canonical mandate, hex. This is what the passkey signs. */
export async function mandateHash(mode: Mandate["mode"], limits: MandateLimits): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ mode, limits }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
