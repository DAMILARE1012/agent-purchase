import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "truth" | "crypto" | "ai" | "bad";

const TONE: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-2 text-ink-2",
  truth: "border-truth bg-truth-bg text-truth",
  crypto: "border-crypto bg-crypto-bg text-crypto",
  ai: "border-ai bg-ai-bg text-ai",
  bad: "border-bad bg-bad-bg text-bad",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
