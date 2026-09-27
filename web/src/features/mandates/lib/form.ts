import type { MandateLimits, MandateMode } from "@/types/domain";

export type LimitErrors = Partial<Record<keyof MandateLimits, string>>;

/** Rules the form enforces before a mandate can be signed. The server checks again. */
export function validateLimits(l: MandateLimits, mode: MandateMode, now: number): LimitErrors {
  const e: LimitErrors = {};
  if (!l.item.trim()) e.item = "Say what the AI should buy.";
  if (!Number.isInteger(l.quantity) || l.quantity < 1) e.quantity = "Quantity must be a whole number, 1 or more.";
  if (l.maxTotalMinor <= 0) e.maxTotalMinor = "Set a maximum. Until you do, nothing can be paid.";
  if (l.maxPerItemMinor !== null && l.maxPerItemMinor > l.maxTotalMinor) e.maxPerItemMinor = "Can't be more than the maximum total.";
  if (!l.deliveryCity?.trim()) e.deliveryCity = "Say which city to deliver to.";
  if (Date.parse(l.expiresAt) <= now) e.expiresAt = "Must be in the future.";
  if (l.deliverBy && Date.parse(l.deliverBy) <= now) e.deliverBy = "Must be in the future.";
  if (!Number.isInteger(l.maxUses) || l.maxUses < 1 || l.maxUses > 50) e.maxUses = "Between 1 and 50.";
  if (mode === "not_present") {
    if (!l.periodCapMinor || l.periodCapMinor <= 0) e.periodCapMinor = "Set a cap. Standing mandates must have one.";
    else if (l.periodCapMinor < l.maxTotalMinor) e.periodCapMinor = "Must be at least the maximum per purchase.";
  }
  return e;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → the value a datetime-local input expects, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO, or null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
