import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { RequireSignIn } from "@/features/session";
import { SendMoneyForm } from "@/features/transfers";

export const metadata: Metadata = { title: "Send money" };

export default async function SendPage({ searchParams }: PageProps<"/send">) {
  const { bank, account } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Send money"
        description="Pay anyone by bank and account number. Every payment comes with a signed receipt they can check."
      />
      <RequireSignIn wallet>
        <SendMoneyForm
          initialBankCode={typeof bank === "string" ? bank : ""}
          initialAccountNumber={typeof account === "string" ? account.replace(/\D/g, "").slice(0, 10) : ""}
        />
      </RequireSignIn>
    </div>
  );
}
