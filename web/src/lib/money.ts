import type { Currency } from "@/types/api";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
    });
    formatters.set(key, fmt);
  }
  return fmt;
}

export function formatMoney(amountMinor: number, currency: Currency = "USD"): string {
  return formatter(currency, false).format(amountMinor / 100);
}

/** Short form for axes and tight spaces: $1.2K, $45K, $3.1M. */
export function formatMoneyCompact(amountMinor: number, currency: Currency = "USD"): string {
  return formatter(currency, true).format(amountMinor / 100);
}

/** Parses user input like "250", "250.5" or "1,250.00" into minor units. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[,\s$]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
