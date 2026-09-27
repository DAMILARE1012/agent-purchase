import type { Metadata } from "next";
import { TransferPostings } from "@/features/ledger";
import { RequireSignIn } from "@/features/session";
import { TransactionDetail } from "@/features/transfers";

export const metadata: Metadata = { title: "Payment" };

export default async function TransactionPage({ params, searchParams }: PageProps<"/transactions/[tx]">) {
  const { tx } = await params;
  const query = await searchParams;
  return (
    <RequireSignIn>
      <TransactionDetail tx={tx} justSent={query.sent === "1"} openRefund={query.refund === "1"} />
      <TransferPostings tx={tx} />
    </RequireSignIn>
  );
}
