import type { Metadata } from "next";
import { LedgerConsole } from "@/features/ledger";

export const metadata: Metadata = { title: "Platform ledger" };

export default function LedgerPage() {
  return <LedgerConsole />;
}
