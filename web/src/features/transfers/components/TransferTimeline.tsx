import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Transfer } from "@/types/api";

interface Step {
  label: string;
  at: string | null;
  tone: "done" | "waiting" | "bad";
}

function interbankSteps(t: Transfer): Step[] {
  const inbound = t.payer.userId.startsWith("ext:"); // The sender is at another bank.
  const bank = (inbound ? t.payer.bankName : t.payee.bankName) ?? "the other bank";
  if (inbound) {
    return [{ label: `Received from ${bank} through the payment network`, at: t.createdAt, tone: "done" }];
  }
  const steps: Step[] = [{ label: "Sent to the payment network, receipt signed", at: t.createdAt, tone: "done" }];
  if (t.status === "initiated") steps.push({ label: "Waiting for you to verify", at: null, tone: "waiting" });
  if (t.status === "held") steps.push({ label: "On hold for a security check", at: null, tone: "waiting" });
  if (t.status === "pending") steps.push({ label: `Waiting for ${bank} to confirm`, at: null, tone: "waiting" });
  if (t.settledAt) steps.push({ label: `Confirmed by ${bank}`, at: t.settledAt, tone: "done" });
  if (t.status === "failed") steps.push({ label: "Failed at the network, money returned to you", at: null, tone: "bad" });
  if (t.reversedAt) steps.push({ label: `Reversed by ${bank}, money returned to you`, at: t.reversedAt, tone: "bad" });
  return steps;
}

function stepsFor(t: Transfer, refunds: Transfer[]): Step[] {
  if (t.rail === "interbank") return interbankSteps(t);
  const steps: Step[] = [{ label: "Payment created and receipt signed", at: t.createdAt, tone: "done" }];
  if (t.status === "initiated") steps.push({ label: "Waiting for the sender to verify", at: null, tone: "waiting" });
  if (t.status === "pending") steps.push({ label: "Waiting to settle", at: null, tone: "waiting" });
  if (t.status === "held") steps.push({ label: "On hold for a security check", at: null, tone: "waiting" });
  if (t.status === "failed") steps.push({ label: "Cancelled and returned to the sender", at: null, tone: "bad" });
  if (t.settledAt) steps.push({ label: "Money arrived", at: t.settledAt, tone: "done" });
  if (t.confirmedAt) steps.push({ label: `Confirmed by ${t.payee.displayName}`, at: t.confirmedAt, tone: "done" });
  for (const r of refunds) {
    steps.push({ label: `Refunded ${formatMoney(r.amountMinor, r.currency)}`, at: r.createdAt, tone: "done" });
  }
  if (t.reversedAt) steps.push({ label: "Payment reversed", at: t.reversedAt, tone: "bad" });
  return steps;
}

const DOT: Record<Step["tone"], string> = {
  done: "bg-truth",
  waiting: "bg-ai",
  bad: "bg-bad",
};

export function TransferTimeline({ transfer, refunds }: { transfer: Transfer; refunds: Transfer[] }) {
  const steps = stepsFor(transfer, refunds);
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-3 left-[5px] h-full w-px bg-line-strong" />}
          <span aria-hidden="true" className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full", DOT[s.tone])} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{s.label}</span>
            {s.at && <span className="text-sm text-muted">{formatDateTime(s.at)}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
