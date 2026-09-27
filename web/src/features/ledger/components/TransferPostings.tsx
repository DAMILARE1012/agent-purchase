"use client";

import { useViewer } from "@/features/session";
import { Journal } from "./Journal";

/** On a payment's page, ops users also see how it was posted to the ledger. */
export function TransferPostings({ tx }: { tx: string }) {
  const { isOps } = useViewer();
  if (!isOps) return null;
  return (
    <section className="mt-8 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Ledger postings</h2>
      <p className="text-sm text-ink-2">Journal entries for this payment, newest first. Visible to platform finance only.</p>
      <Journal tx={tx} />
    </section>
  );
}
