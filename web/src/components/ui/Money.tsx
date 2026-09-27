import type { Currency } from "@/types/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

export function Money({ amountMinor, currency = "NGN", className }: { amountMinor: number; currency?: Currency; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatMoney(amountMinor, currency)}</span>;
}
