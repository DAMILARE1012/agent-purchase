"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Alert, LoadingState, PageHeader } from "@/components/ui";
import { useViewer } from "@/features/session";
import { errorMessage } from "@/lib/api-error";
import { DEMO_MODE as SHOW_SANDBOX } from "@/lib/demo";
import { useGetDemoScenariosQuery } from "../api";
import { useFragmentToken } from "../hooks/useFragmentToken";
import { useReceiptScan } from "../hooks/useReceiptScan";
import { DemoScenarios } from "./DemoScenarios";
import { ReceiptInput } from "./ReceiptInput";
import { VerdictPanel } from "./VerdictPanel";

/** The page a receipt QR opens: /r#RCPT1… */
export function VerifyScreen() {
  const router = useRouter();
  const fragmentToken = useFragmentToken();
  const scenarioParam = useSearchParams().get("scenario");
  const { isLoading: sessionLoading } = useViewer();
  const { data: scenarios } = useGetDemoScenariosQuery(undefined, { skip: !SHOW_SANDBOX || !scenarioParam });
  const { run, clear, result, error, isLoading, lastRequest } = useReceiptScan();

  // Opened from a receipt link: check it straight away.
  useEffect(() => {
    if (sessionLoading) return;
    if (fragmentToken && lastRequest?.token !== fragmentToken) run({ token: fragmentToken, source: "link" });
  }, [fragmentToken, lastRequest, run, sessionLoading]);

  // Back from "Sign in as …" on a sandbox scenario: run it now.
  useEffect(() => {
    if (sessionLoading || !scenarioParam || !scenarios) return;
    const scenario = scenarios.find((s) => s.id === scenarioParam);
    router.replace("/r", { scroll: false });
    if (scenario) run(scenario.request, scenario.id);
  }, [scenarioParam, scenarios, sessionLoading, run, router]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Verify"
        title="Check a payment receipt"
        description="We check the payment itself on the platform, not the picture you were sent."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {isLoading && <LoadingState label="Checking the payment…" />}
          {error && (
            <Alert tone="bad" title="We couldn't check this receipt">
              {errorMessage(error)}
            </Alert>
          )}
          {result && !isLoading && <VerdictPanel result={result} onCheckAnother={clear} />}
          {!result && !isLoading && <ReceiptInput />}
        </div>
        {SHOW_SANDBOX && <DemoScenarios />}
      </div>
    </div>
  );
}
