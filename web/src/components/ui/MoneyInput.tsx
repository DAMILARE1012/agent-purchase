"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { Input } from "./Field";

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Kobo, or null when empty. */
  valueMinor: number | null;
  /** Called with kobo, or null when the field is empty or not a valid amount. */
  onChangeMinor: (minor: number | null) => void;
}

/** A naira amount field: accepts "40000", "40,000" or "₦40,000.50" and reports kobo. */
export function MoneyInput({ valueMinor, onChangeMinor, className, ...rest }: MoneyInputProps) {
  const [text, setText] = useState(valueMinor ? formatMoney(valueMinor).replace("₦", "") : "");
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">₦</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("pl-7 tabular-nums", className)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChangeMinor(e.target.value.trim() ? parseMoneyInput(e.target.value) : null);
        }}
        {...rest}
      />
    </div>
  );
}
