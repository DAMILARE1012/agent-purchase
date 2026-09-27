import type { Metadata } from "next";
import { CaseQueue } from "@/features/risk";
import { RequireSignIn } from "@/features/session";

export const metadata: Metadata = { title: "Risk console" };

export default function RiskPage() {
  return (
    <RequireSignIn roles={["analyst"]} roleHint={{ username: "morgan", label: "Morgan (risk analyst)" }}>
      <CaseQueue />
    </RequireSignIn>
  );
}
