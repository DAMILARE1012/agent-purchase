import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** A small coloured mark beside the label carrying identity (e.g. a chart series). */
  marker?: string;
  icon?: ReactNode;
  className?: string;
}

/** One headline figure: label, value, supporting detail. */
export function StatTile({ label, value, detail, marker, icon, className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border border-line bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
          {marker && <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: marker }} />}
          {label}
        </span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <span className="text-3xl font-semibold tracking-tight text-ink">{value}</span>
      {detail && <span className="text-sm text-muted">{detail}</span>}
    </div>
  );
}
