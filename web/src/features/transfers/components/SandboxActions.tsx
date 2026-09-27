"use client";

import { Alert, Button } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { useAppDispatch } from "@/store/hooks";
import type { Transfer } from "@/types/api";
import { useSimulateRailMutation } from "../api";

/** Demo tools that stand in for the payment rail. Not part of the product. */
export function SandboxActions({ transfer: t }: { transfer: Transfer }) {
  const dispatch = useAppDispatch();
  const [simulate, { isLoading, error, originalArgs }] = useSimulateRailMutation();
  const canSettle = t.status === "pending";
  const canReverse = t.status === "settled" && t.kind === "payment";
  if (!canSettle && !canReverse) return null;

  async function run(action: "settle" | "reverse") {
    const result = await simulate({ tx: t.tx, action });
    if ("data" in result) dispatch(notify(action === "settle" ? "Payment settled." : "Payment reversed.", "info"));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong p-4">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">Sandbox</p>
        <p className="text-sm text-ink-2">Simulate what the payment rail would do to this payment.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canSettle && (
          <Button size="sm" variant="secondary" onClick={() => run("settle")} loading={isLoading && originalArgs?.action === "settle"}>
            Settle now
          </Button>
        )}
        {canReverse && (
          <Button size="sm" variant="secondary" onClick={() => run("reverse")} loading={isLoading && originalArgs?.action === "reverse"}>
            Simulate reversal
          </Button>
        )}
      </div>
      {error && <Alert tone="bad">{errorMessage(error)}</Alert>}
    </div>
  );
}
