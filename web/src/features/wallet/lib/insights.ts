import { dayKey, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Transfer } from "@/types/api";

export type Period = "7" | "30" | "90";

export const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const DAY_MS = 86_400_000;

/** When money actually moved: settlement time, or creation for older records. */
function movedAt(t: Transfer): Date {
  return new Date(t.settledAt ?? t.createdAt);
}

function periodStart(days: number, now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return new Date(start.getTime() - (days - 1) * DAY_MS);
}

/** Only settled money counts toward totals: pending, held and reversed payments aren't in your balance. */
function settledInPeriod(transfers: Transfer[], days: number, now: Date): Transfer[] {
  const start = periodStart(days, now).getTime();
  return transfers.filter((t) => t.status === "settled" && movedAt(t).getTime() >= start);
}

export interface Totals {
  inMinor: number;
  outMinor: number;
  inCount: number;
  outCount: number;
}

export function totals(transfers: Transfer[], days: number, now = new Date()): Totals {
  const result: Totals = { inMinor: 0, outMinor: 0, inCount: 0, outCount: 0 };
  for (const t of settledInPeriod(transfers, days, now)) {
    if (t.direction === "in") {
      result.inMinor += t.amountMinor;
      result.inCount++;
    } else {
      result.outMinor += t.amountMinor;
      result.outCount++;
    }
  }
  return result;
}

export interface DayFlow {
  key: string;
  date: Date;
  inMinor: number;
  outMinor: number;
}

/** One bucket per calendar day in the period, oldest first, including empty days. */
export function dailyFlows(transfers: Transfer[], days: number, now = new Date()): DayFlow[] {
  const start = periodStart(days, now);
  const buckets: DayFlow[] = Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    return { key: dayKey(date), date, inMinor: 0, outMinor: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const t of settledInPeriod(transfers, days, now)) {
    const bucket = byKey.get(dayKey(movedAt(t)));
    if (!bucket) continue;
    if (t.direction === "in") bucket.inMinor += t.amountMinor;
    else bucket.outMinor += t.amountMinor;
  }
  return buckets;
}

export interface AttentionItem {
  id: string;
  tone: "truth" | "ai" | "bad";
  title: string;
  detail: string;
  href: string;
  action: string;
}

/** Things the user should act on or know about, most recent first. */
export function attentionItems(transfers: Transfer[], now = Date.now()): AttentionItem[] {
  const items: Array<AttentionItem & { at: string }> = [];
  for (const t of transfers) {
    const amount = formatMoney(t.amountMinor, t.currency);
    const other = t.direction === "in" ? t.payer.displayName : t.payee.displayName;
    const base = { id: t.tx, href: `/transactions/${t.tx}`, at: t.createdAt };
    const when = formatRelative(t.createdAt, now);

    if (t.direction === "in" && t.kind === "payment" && t.status === "settled" && !t.confirmedAt) {
      items.push({ ...base, tone: "truth", title: `Confirm ${amount} from ${other}`, detail: `Arrived ${when}`, action: "Review" });
    } else if (t.direction === "out" && t.status === "held") {
      items.push({ ...base, tone: "ai", title: `${amount} to ${other} is on hold`, detail: "Security review in progress", action: "View" });
    } else if (t.direction === "out" && t.status === "initiated") {
      items.push({ ...base, tone: "ai", title: `Verify your ${amount} payment to ${other}`, detail: "Waiting for your verification code", action: "Finish" });
    } else if (t.direction === "out" && t.status === "pending" && t.rail === "interbank") {
      items.push({ ...base, tone: "ai", title: `${amount} to ${other} is processing`, detail: `Waiting for ${t.payee.bankName} to confirm`, action: "View" });
    } else if (t.direction === "in" && t.status === "pending") {
      items.push({ ...base, tone: "ai", title: `${amount} from ${other} hasn't arrived yet`, detail: `Sent ${when}`, action: "View" });
    } else if (t.status === "reversed" && t.reversedAt && now - new Date(t.reversedAt).getTime() < 7 * DAY_MS) {
      items.push({ ...base, tone: "bad", title: `${amount} ${t.direction === "in" ? "from" : "to"} ${other} was reversed`, detail: `Reversed ${formatRelative(t.reversedAt, now)}`, action: "View", at: t.reversedAt });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
}

export interface Contact {
  userId: string;
  displayName: string;
  handle: string;
  accountNumber?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  count: number;
}

/** People you've exchanged money with most often. */
export function topContacts(transfers: Transfer[], limit = 5): Contact[] {
  const counts = new Map<string, Contact>();
  for (const t of transfers) {
    if (t.kind !== "payment") continue;
    const other = t.direction === "in" ? t.payer : t.payee;
    const entry = counts.get(other.userId) ?? { ...other, count: 0 };
    entry.count++;
    counts.set(other.userId, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Money on its way to you: pending incoming payments. */
export function incomingPendingMinor(transfers: Transfer[]): number {
  return transfers.filter((t) => t.direction === "in" && t.status === "pending").reduce((s, t) => s + t.amountMinor, 0);
}
