import { Alert } from "@/components/ui";
import type { ScanWarning, WarningCode } from "@/types/api";

const TITLE: Record<WarningCode, string> = {
  previously_checked: "Not a new payment",
  old_receipt: "Older payment",
  visual_check_unavailable: "Image not checked",
  not_your_payment: "Paid to someone else",
};

/** Warnings sit above the verdict and never change it (§7.1). */
export function WarningList({ warnings }: { warnings: ScanWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w) => (
        <Alert key={w.code} tone="ai" title={TITLE[w.code]}>
          {w.message}
        </Alert>
      ))}
    </div>
  );
}
