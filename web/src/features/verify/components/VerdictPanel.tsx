import { Card, Money } from "@/components/ui";
import { TransferStatusBadge } from "@/features/transfers";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import type { ScanResult, Verdict } from "@/types/api";
import { ChecksList } from "./ChecksList";
import { VerdictActions } from "./VerdictActions";
import { WarningList } from "./WarningList";

const VERDICT: Record<Verdict, { glyph: string; className: string }> = {
  VERIFIED: { glyph: "✓", className: "border-truth bg-truth-bg text-truth" },
  PENDING: { glyph: "…", className: "border-ai bg-ai-bg text-ai" },
  SUSPICIOUS: { glyph: "!", className: "border-bad bg-bad-bg text-bad" },
};

function headline(r: ScanResult): string {
  if (r.verdict === "SUSPICIOUS") return "Don't treat this as paid";
  if (r.verdict === "PENDING") return "Not received yet";
  if (r.view === "public") return "Genuine receipt";
  if (r.view === "payer") return "Payment delivered";
  return "Payment received";
}

export function VerdictPanel({ result, onCheckAnother }: { result: ScanResult; onCheckAnother: () => void }) {
  const v = VERDICT[result.verdict];
  const t = result.transfer;

  return (
    <div className="flex flex-col gap-4">
      <WarningList warnings={result.warnings} />

      <section aria-live="polite" className={cn("flex items-start gap-4 rounded-lg border-2 p-5", v.className)}>
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-surface font-display text-2xl font-bold">
          {v.glyph}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest">{result.verdict}</p>
          <h2 className="font-display text-2xl font-bold text-ink">{headline(result)}</h2>
          <p className="text-ink">{result.message}</p>
        </div>
      </section>

      {t && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted">Real payment on record</span>
            <Money amountMinor={t.amountMinor} currency={t.currency} className="font-display text-3xl font-bold" />
            <span className="text-sm text-ink-2">
              {t.payerName && t.payeeName ? `${t.payerName} → ${t.payeeName} · ` : ""}
              {t.payeeBankName ? `${t.payeeBankName} ${t.payeeAccountMasked} · ` : ""}
              {formatDateTime(t.createdAt)}
            </span>
          </div>
          <TransferStatusBadge status={t.status} />
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-semibold">What we checked</h3>
        <ChecksList checks={result.checks} />
      </Card>

      <VerdictActions result={result} onCheckAnother={onCheckAnother} />
    </div>
  );
}
