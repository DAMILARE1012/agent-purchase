import type { Metadata } from "next";
import { CaseDetailView } from "@/features/risk";
import { RequireSignIn } from "@/features/session";

export const metadata: Metadata = { title: "Case" };

export default async function CasePage({ params }: PageProps<"/risk/cases/[id]">) {
  const { id } = await params;
  return (
    <RequireSignIn roles={["analyst"]} roleHint={{ username: "morgan", label: "Morgan (risk analyst)" }}>
      <CaseDetailView id={id} />
    </RequireSignIn>
  );
}
