import type { CaseDecision, CaseKind } from "@/types/api";

export const CASE_KIND_LABEL: Record<CaseKind, string> = {
  held_transfer: "Held payment",
  suspicious_scan: "Suspicious receipt",
  dispute: "Dispute",
  reversal_shortfall: "Refund shortfall",
};

export const DECISION: Record<CaseDecision, { label: string; variant: "primary" | "secondary" | "danger" }> = {
  release: { label: "Release payment", variant: "primary" },
  cancel: { label: "Cancel and return funds", variant: "danger" },
  resolve_for_payee: { label: "Resolve for payee", variant: "primary" },
  resolve_for_payer: { label: "Resolve for payer", variant: "secondary" },
  close: { label: "Close case", variant: "secondary" },
};
