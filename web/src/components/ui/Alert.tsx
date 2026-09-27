import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "./Badge";

const TONE: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-2",
  truth: "border-truth bg-truth-bg",
  crypto: "border-crypto bg-crypto-bg",
  ai: "border-ai bg-ai-bg",
  bad: "border-bad bg-bad-bg",
};

interface AlertProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = "neutral", title, children, action, className }: AlertProps) {
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("rounded-md border-l-4 px-4 py-3 text-sm", TONE[tone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title && <p className="font-semibold text-ink">{title}</p>}
          {children && <div className="text-ink-2">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}
