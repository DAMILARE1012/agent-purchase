import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { ScanChecks } from "@/types/api";

type Mark = "pass" | "warn" | "fail" | "skip";

interface Row {
  label: string;
  detail: string;
  mark: Mark;
  ai?: boolean;
}

function rowsFor(c: ScanChecks): Row[] {
  const signature: Row = {
    label: "Receipt signature",
    ...{
      pass: { detail: "Issued by the platform and unchanged", mark: "pass" as Mark },
      fail: { detail: "Not issued by the platform", mark: "fail" as Mark },
      skipped: { detail: "No receipt code found", mark: "skip" as Mark },
    }[c.signature],
  };

  const statusText: Record<string, [string, Mark]> = {
    settled: ["Money has arrived", "pass"],
    pending: ["Not arrived yet", "warn"],
    initiated: ["Waiting for the sender to verify", "warn"],
    held: ["On hold for a security check", "warn"],
    failed: ["Cancelled", "fail"],
    reversed: ["Reversed", "fail"],
    unknown: ["No matching payment", c.signature === "pass" ? "fail" : "skip"],
  };
  const [statusDetail, statusMark] = statusText[c.status];

  const payee: Record<ScanChecks["payee"], [string, Mark]> = {
    match: ["Paid to you", "pass"],
    payer: ["You sent this payment", "pass"],
    other: ["Paid to someone else", "warn"],
    public: ["Hidden because you're not signed in", "skip"],
    external: ["Sent to an account at another bank", "pass"],
    skipped: ["Not checked", "skip"],
  };

  const replay: Record<ScanChecks["replay"], [string, Mark]> = {
    none: ["Not confirmed before", "pass"],
    confirmed: ["Already confirmed before", "fail"],
    checked_before: ["You've checked it before", "warn"],
    skipped: ["Not checked", "skip"],
  };

  const v = c.vision;
  const vision: Record<ScanChecks["vision"]["result"], [string, Mark]> = {
    match: ["Printed amount matches the real payment", "pass"],
    mismatch: [`Printed amount ${v.printedAmountMinor !== undefined ? formatMoney(v.printedAmountMinor) : ""} doesn't match`, "fail"],
    edited: [`Signs of editing (score ${v.tamperScore?.toFixed(2)})`, "fail"],
    unavailable: ["Couldn't run on this image", "warn"],
    not_run: ["No image submitted", "skip"],
  };

  return [
    signature,
    { label: "Live status", detail: statusDetail, mark: statusMark },
    { label: "Who it was paid to", detail: payee[c.payee][0], mark: payee[c.payee][1] },
    { label: "Used before", detail: replay[c.replay][0], mark: replay[c.replay][1] },
    { label: "Image check", detail: vision[v.result][0], mark: vision[v.result][1], ai: true },
  ];
}

const MARK: Record<Mark, { glyph: string; className: string; sr: string }> = {
  pass: { glyph: "✓", className: "bg-truth-bg text-truth", sr: "Passed" },
  warn: { glyph: "!", className: "bg-ai-bg text-ai", sr: "Warning" },
  fail: { glyph: "✕", className: "bg-bad-bg text-bad", sr: "Failed" },
  skip: { glyph: "–", className: "bg-surface-2 text-muted", sr: "Not checked" },
};

/** What the verification service checked, in the order it checks them (§7.2). */
export function ChecksList({ checks }: { checks: ScanChecks }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rowsFor(checks).map((row) => {
        const mark = MARK[row.mark];
        return (
          <li key={row.label} className="flex items-center gap-3 py-2.5">
            <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", mark.className)}>
              {mark.glyph}
            </span>
            <span className="sr-only">{mark.sr}:</span>
            <span className="w-40 shrink-0 text-sm font-semibold">
              {row.label}
              {row.ai && <span className="ml-1.5 font-mono text-[10px] font-semibold tracking-wide text-ai">AI</span>}
            </span>
            <span className="text-sm text-ink-2">{row.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
