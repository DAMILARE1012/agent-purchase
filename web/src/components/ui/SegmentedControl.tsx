"use client";

import { cn } from "@/lib/cn";

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

/** A row of mutually exclusive options (period filter, direction filter, status tabs). */
export function SegmentedControl<T extends string>({ label, value, options, onChange, size = "sm" }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              selected ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("rounded px-1 font-mono text-[10px]", selected ? "bg-surface-2" : "bg-canvas")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
