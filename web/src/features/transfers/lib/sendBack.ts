import { hoursSince } from "@/lib/dates";
import type { Transfer } from "@/types/api";

export const SEND_BACK_WINDOW_HOURS = 72;

/**
 * The most recent settled on-platform payment the viewer received from this
 * account within the send-back window (system_design.md §6.5). If one exists,
 * money going back to that person should travel as a Refund of it.
 */
export function findRecentPaymentFrom(transfers: Transfer[], bankCode: string, accountNumber: string): Transfer | undefined {
  return transfers.find(
    (t) =>
      t.direction === "in" &&
      t.kind === "payment" &&
      t.rail === "internal" &&
      t.status === "settled" &&
      t.payer.bankCode === bankCode &&
      t.payer.accountNumber === accountNumber &&
      t.refundedMinor < t.amountMinor &&
      hoursSince(t.createdAt) <= SEND_BACK_WINDOW_HOURS,
  );
}
