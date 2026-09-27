"use client";

import { useState } from "react";
import { formatDayMonth } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { useElementWidth } from "@/lib/useElementWidth";
import type { DayFlow } from "../lib/insights";

// Money in grows up from the baseline, money out grows down: position carries
// direction as well as colour, so the chart reads without colour vision.

const HEIGHT = 240;
const M = { top: 22, right: 8, bottom: 28, left: 52 };
const MAX_BAR = 24;
const RADIUS = 4;

function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Bar path, rounded at the data end and square at the baseline. */
function barPath(x: number, base: number, end: number, w: number): string {
  const h = Math.abs(end - base);
  if (h < 0.5) return "";
  const r = Math.min(RADIUS, h, w / 2);
  const dir = end < base ? 1 : -1; // up: corners curve downward into the bar
  return `M${x},${base} V${end + dir * r} Q${x},${end} ${x + r},${end} H${x + w - r} Q${x + w},${end} ${x + w},${end + dir * r} V${base} Z`;
}

export function CashFlowChart({ days }: { days: DayFlow[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const maxIn = niceCeil(Math.max(0, ...days.map((d) => d.inMinor)));
  const maxOut = niceCeil(Math.max(0, ...days.map((d) => d.outMinor)));
  const hasData = maxIn > 0 || maxOut > 0;

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const span = maxIn + maxOut || 1;
  const y = (v: number) => M.top + ((maxIn - v) / span) * plotH;
  const base = y(0);
  const band = days.length ? plotW / days.length : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, band * 0.6));

  const ticks = [...new Set([maxIn, maxIn / 2, 0, -maxOut / 2, -maxOut])].filter((t) => (t > 0 ? maxIn > 0 : t < 0 ? maxOut > 0 : true));
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const peak = days.reduce((best, d, i) => (d.inMinor > (days[best]?.inMinor ?? 0) ? i : best), 0);
  const totalIn = days.reduce((s, d) => s + d.inMinor, 0);
  const totalOut = days.reduce((s, d) => s + d.outMinor, 0);
  const hovered = active !== null ? days[active] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-2 text-ink-2">
          <span aria-hidden="true" className="h-3 w-2.5 rounded-sm bg-chart-in" /> Money in
        </span>
        <span className="flex items-center gap-2 text-ink-2">
          <span aria-hidden="true" className="h-3 w-2.5 rounded-sm bg-chart-out" /> Money out
        </span>
      </div>

      <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
        {!hasData && (
          <div className="absolute inset-0 grid place-items-center rounded-lg border border-dashed border-line text-sm text-muted">
            No settled payments in this period
          </div>
        )}
        {hasData && width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            aria-label={`Money in and out per day. Total in ${formatMoney(totalIn)}, total out ${formatMoney(totalOut)}.`}
            className="block overflow-visible"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1.5 : 1} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {formatMoneyCompact(Math.abs(t))}
                </text>
              </g>
            ))}

            {active !== null && <rect x={M.left + active * band} y={M.top} width={band} height={plotH} className="fill-surface-2" />}

            {days.map((d, i) => {
              const x = M.left + i * band + (band - barW) / 2;
              const dim = active !== null && active !== i;
              return (
                <g key={d.key} opacity={dim ? 0.45 : 1} className="transition-opacity">
                  {d.inMinor > 0 && <path d={barPath(x, base - 1, y(d.inMinor), barW)} fill="var(--chart-in)" />}
                  {d.outMinor > 0 && <path d={barPath(x, base + 1, y(-d.outMinor), barW)} fill="var(--chart-out)" />}
                </g>
              );
            })}

            {active === null && days[peak]?.inMinor > 0 && (
              <text x={M.left + peak * band + band / 2} y={y(days[peak].inMinor) - 6} textAnchor="middle" className="fill-ink-2 text-[11px] font-semibold">
                {formatMoneyCompact(days[peak].inMinor)}
              </text>
            )}

            {days.map((d, i) =>
              (days.length - 1 - i) % labelEvery === 0 ? (
                <text key={d.key} x={M.left + i * band + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {formatDayMonth(d.date)}
                </text>
              ) : null,
            )}

            {days.map((d, i) => (
              <rect
                key={d.key}
                x={M.left + i * band}
                y={M.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${formatDayMonth(d.date)}: in ${formatMoney(d.inMinor)}, out ${formatMoney(d.outMinor)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none focus-visible:stroke-crypto"
              />
            ))}
          </svg>
        )}

        {hovered && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(M.left + active * band + band / 2 - 88, 0), Math.max(0, width - 176)) }}
          >
            <p className="mb-2 text-muted">{formatDayMonth(hovered.date)}</p>
            <p className="flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-3 rounded bg-chart-in" />
              <span className="font-semibold tabular-nums text-ink">{formatMoney(hovered.inMinor)}</span>
              <span className="text-muted">in</span>
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-3 rounded bg-chart-out" />
              <span className="font-semibold tabular-nums text-ink">{formatMoney(hovered.outMinor)}</span>
              <span className="text-muted">out</span>
            </p>
            <p className="mt-2 border-t border-line pt-2 text-muted">
              Net <span className="font-semibold tabular-nums text-ink">{formatMoney(hovered.inMinor - hovered.outMinor)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
