"use client";

import { Button, Card } from "@/components/ui";
import { notify } from "@/features/notifications";
import { signIn, SignOutButton, useViewer } from "@/features/session";
import { cn } from "@/lib/cn";
import { DEMO_PASSWORD } from "@/lib/demo";
import { useAppDispatch } from "@/store/hooks";
import type { DemoScenario } from "@/types/api";
import { useGetDemoScenariosQuery, useResetDemoMutation } from "../api";
import { useReceiptScan } from "../hooks/useReceiptScan";
import { scanCleared } from "../verifySlice";

const NAMES: Record<string, string> = { rita: "Rita", ada: "Ada", sam: "Sam", jordan: "Jordan" };

/**
 * Sandbox panel: one click runs a receipt through each branch of the checks.
 * Each scenario is meant to be seen by a particular person; if you're signed in
 * as someone else, it offers to sign you in as them and comes straight back.
 */
export function DemoScenarios() {
  const dispatch = useAppDispatch();
  const { username, isSignedIn, isOps } = useViewer();
  const { data: scenarios = [] } = useGetDemoScenariosQuery();
  const [resetDemo, { isLoading: resetting }] = useResetDemoMutation();
  const { run, scenarioId, isLoading } = useReceiptScan();

  const isRightViewer = (s: DemoScenario) => (s.viewerUsername === "" ? !isSignedIn : s.viewerUsername === username);

  function onClick(s: DemoScenario) {
    if (isRightViewer(s)) {
      run(s.request, s.id);
    } else if (s.viewerUsername) {
      signIn({ loginHint: s.viewerUsername, returnTo: `/r?scenario=${s.id}` });
    }
  }

  async function onReset() {
    dispatch(scanCleared());
    const res = await resetDemo();
    if ("data" in res) dispatch(notify("Demo data restored.", "info"));
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">Sandbox</p>
        <h2 className="font-display text-lg font-semibold">Try a scenario</h2>
        <p className="text-sm text-ink-2">Each receipt is checked as the person it was shown to.{DEMO_PASSWORD && <> Password for demo users: <span className="font-mono">{DEMO_PASSWORD}</span>.</>}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {scenarios.map((s) => {
          const ready = isRightViewer(s);
          return (
            <li key={s.id}>
              {!ready && s.viewerUsername === "" ? (
                <div className="flex flex-col gap-1.5 rounded-md border border-line px-3 py-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-muted">{s.description}</span>
                  <SignOutButton label="Sign out to try this" variant="ghost" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onClick(s)}
                  disabled={isLoading}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60",
                    scenarioId === s.id ? "border-crypto bg-crypto-bg" : "border-line hover:bg-surface-2",
                  )}
                >
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-muted">{s.description}</span>
                  {!ready && <span className="mt-1 text-xs font-semibold text-crypto">Sign in as {NAMES[s.viewerUsername] ?? s.viewerUsername} →</span>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {isOps && <Button variant="ghost" size="sm" onClick={onReset} loading={resetting}>Reset demo data</Button>}
    </Card>
  );
}
