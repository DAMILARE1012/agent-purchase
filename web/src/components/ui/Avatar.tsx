import { cn } from "@/lib/cn";

// Neutral, theme-aware tints. Avatars identify people; they don't encode data.
const TINTS = ["bg-truth-bg text-truth", "bg-crypto-bg text-crypto", "bg-ai-bg text-ai", "bg-surface-2 text-ink-2"];

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function tintFor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ name, seed, size = "md", className }: { name: string; seed?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-11 text-sm" : "size-9 text-xs",
        tintFor(seed ?? name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
