// Stand-in for Qwen's intent.compile task: turns a sentence into draft mandate
// limits with simple patterns. Anything it can't find is set to the strictest
// value and becomes a question, as the real compiler must do (design §3, step 1).

import type { MandateDraft, MandateLimits, MandateMode, MandateQuestion } from "@/types/domain";
import { LIVE_VERSION, nextWeekday } from "./data";

const HOUR = 3_600_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const BRANDS = ["HP", "Canon", "Epson", "MTN", "Airtel", "Glo", "Oraimo", "Samsung", "Tecno", "Infinix", "Indomie"];
const CATEGORIES: Array<[RegExp, string]> = [
  [/toner|cartridge|ink/i, "Printer toner"],
  [/\bdata\b|bundle|\bgb\b/i, "Data"],
  [/paper|ream/i, "Paper"],
  [/charger/i, "Chargers"],
  [/power ?bank/i, "Power banks"],
  [/rice|oil|indomie|noodles|provisions|tomato/i, "Groceries"],
];

function parseAmount(text: string): number | null {
  const m =
    /(?:under|below|max(?:imum)?|at most|not more than|less than|within|up to)\s*(?:₦|n|ngn)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m)?\b/i.exec(text) ??
    /₦\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m)?\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function parseDeadline(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(by|before)\s+tomorrow\b/.test(t)) {
    const d = new Date(Date.now() + 24 * HOUR);
    d.setHours(18, 0, 0, 0);
    return d.toISOString();
  }
  const day = WEEKDAYS.findIndex((w) => new RegExp(`\\b(by|before|on)\\s+${w}\\b`).test(t));
  return day >= 0 ? nextWeekday(day) : null;
}

export function compileDraft(request: string, mode: MandateMode): MandateDraft {
  const text = request.trim();
  const defaulted: Array<keyof MandateLimits> = [];
  const questions: MandateQuestion[] = [];

  const item = text.split(/[,.;]| under | below | at most | from | delivered | by /i)[0]
    .replace(/^(please\s+)?(buy|get|order|find)( me)?\s+/i, "")
    .trim();
  const brandMatch = new RegExp(`\\b(${BRANDS.join("|")})\\b\\s*([A-Za-z0-9-]*\\d[A-Za-z0-9-]*)?`, "i").exec(text);
  const brand = brandMatch ? BRANDS.find((b) => b.toLowerCase() === brandMatch[1].toLowerCase())! : null;
  const model = brandMatch?.[2] && !/^\d+\s*gb$/i.test(brandMatch[2]) ? brandMatch[2].toUpperCase() : null;
  const category = CATEGORIES.find(([re]) => re.test(text))?.[1] ?? null;
  const qtyMatch = /^\s*(?:buy |get )?(\d{1,3})\s+(?!gb\b|kg\b|l\b|litres?\b|w\b)/i.exec(text);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;

  const amount = parseAmount(text);
  if (amount === null) {
    defaulted.push("maxTotalMinor");
    questions.push({ field: "maxTotalMinor", question: "What's the most you want to spend, including delivery? Until you say, nothing can be paid." });
  }

  let sellerPolicy: MandateLimits["sellerPolicy"] = "verified_only";
  if (/known|any seller|trusted/i.test(text) && !/verified only|only verified/i.test(text)) sellerPolicy = "verified_and_known";
  else if (!/verified/i.test(text)) defaulted.push("sellerPolicy");

  const deliverBy = parseDeadline(text);
  if (!deliverBy && mode === "present") {
    defaulted.push("deliverBy");
    questions.push({ field: "deliverBy", question: "When do you need it by? Without a date, any delivery date is accepted." });
  }

  const standing = mode === "not_present";
  const weekly = /week/i.test(text);
  if (!standing) defaulted.push("expiresAt", "maxUses");

  const limits: MandateLimits = {
    item: item || text,
    brand,
    model,
    category,
    quantity,
    maxTotalMinor: amount ?? 0,
    maxPerItemMinor: null,
    sellerPolicy,
    sellerIds: [],
    deliverBy,
    expiresAt: new Date(Date.now() + (standing ? 30 * 24 : 24) * HOUR).toISOString(),
    maxUses: standing ? 10 : 1,
    periodCapMinor: standing ? amount : null,
    period: standing ? (weekly ? "week" : "month") : null,
    shareDelivery: { name: true, phone: true, address: !/data|airtime/i.test(text) },
  };
  if (standing && !/week|month/i.test(text)) {
    defaulted.push("period");
    questions.push({ field: "period", question: "Is the limit per week or per month?" });
  }

  return { request: text, mode, limits, defaulted, questions, compiledBy: `${LIVE_VERSION} · intent.compile v3` };
}
