import type { Metadata } from "next";
import { LedgerConsole } from "@/features/ledger";
import { RequireSignIn } from "@/features/session";

export const metadata: Metadata = { title: "Platform ledger" };

export default function LedgerPage() {
  return (
    <RequireSignIn roles={["ops"]} roleHint={{ username: "olivia", label: "Olivia (platform finance)" }}>
      <LedgerConsole />
    </RequireSignIn>
  );
}
