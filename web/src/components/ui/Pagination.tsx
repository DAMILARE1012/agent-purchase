"use client";

import { cn } from "@/lib/cn";

interface PaginationProps {
  /** 1-based. */
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
  /** What's being paged, for screen readers ("Products"). */
  label: string;
}

/** Page numbers around the current one, with gaps: 1 … 4 5 6 … 12. */
function pageList(page: number, count: number): Array<number | "gap"> {
  const wanted = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, pageCount, total, perPage, onChange, label }: PaginationProps) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  const button = "grid h-9 min-w-9 place-items-center rounded-md px-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav aria-label={`${label}, pages`} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        Showing <b className="text-ink">{first}–{last}</b> of {total}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className={cn(button, "border border-line hover:bg-surface-2")} onClick={() => onChange(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        {pageList(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-muted">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(button, p === page ? "bg-ink text-canvas" : "text-ink-2 hover:bg-surface-2")}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className={cn(button, "border border-line hover:bg-surface-2")} onClick={() => onChange(page + 1)} disabled={page >= pageCount}>
          Next
        </button>
      </div>
    </nav>
  );
}
