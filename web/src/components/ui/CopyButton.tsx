"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Copies text, then says so for two seconds. Falls back to a hint if the clipboard is blocked. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn("rounded-md px-2 py-1 text-xs font-semibold text-crypto hover:bg-surface-2", className)}
      aria-live="polite"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : label}
    </button>
  );
}
