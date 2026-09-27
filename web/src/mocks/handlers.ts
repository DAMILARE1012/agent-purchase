// The mock API. Each route here is served in the browser until the FastAPI
// service implements it; delete a route when the real endpoint ships.
// State lives in memory and resets when the page reloads.
//
// Real since M4: seller directory, seller profile, catalog, bank accounts, admin tiers.
// Real since M5: mandates, AI shopping runs (with live events), carts, support's
// blocked carts, ops overview, run traces, agent versions.
// Real since M7: paying for carts, purchases, receipts and their public check, seller orders.
// Real since M8: evaluation results and the release gate.
// Still mocked: disputes and refunds (M12), the test-marketplace report (M9), admin users.

import type { FetchArgs } from "@reduxjs/toolkit/query";
import type { AdminUser, ResolveDisputeRequest } from "@/types/domain";
import { disputes, purchases, rangeReports, seedRuns, sellers, users } from "./data";
import { decide } from "./gate";
import { MockError, Router } from "./router";

let seeded = false;
function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  seedRuns((m, c, at, periodSpentMinor) => decide(m, c, sellers, { at, periodSpentMinor }));
}

const byNewest = <T,>(key: (t: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

function findOr404<T>(items: T[], pred: (t: T) => boolean, what: string): T {
  const found = items.find(pred);
  if (!found) throw new MockError(404, "not_found", `${what} not found.`);
  return found;
}

const router = new Router()
  // Disputes (M12)
  .on("GET", "support/disputes", () => [...disputes].sort(byNewest((d) => d.openedAt)))
  .on("POST", "support/disputes/:id/resolve", ({ params, body }) => {
    const d = findOr404(disputes, (x) => x.id === params.id, "Dispute");
    if (d.status === "resolved") throw new MockError(409, "already_resolved", "This dispute is already resolved.");
    const { outcome } = body as ResolveDisputeRequest;
    Object.assign(d, { status: "resolved", resolution: outcome, resolvedAt: new Date().toISOString() });
    const p = purchases.find((x) => x.id === d.purchaseId);
    if (p) p.status = outcome === "refunded" ? "refunded" : "paid";
    return d;
  })
  // The test marketplace (M9)
  .on("GET", "ops/range", () => rangeReports)
  // Admin users
  .on("GET", "admin/users", () => users)
  .on("POST", "admin/users/:id/status", ({ params, body }) => {
    const u = findOr404(users, (x) => x.id === params.id, "User");
    const { status } = body as { status: AdminUser["status"] };
    if (u.role === "admin" && status === "suspended") throw new MockError(409, "cannot_suspend_admin", "Admins can't be suspended here.");
    u.status = status;
    return u;
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serves a request from the mock API, or returns null so the real API handles it.
 * Responses are deep-copied so components can't mutate mock state.
 */
export async function handleMock(args: string | FetchArgs) {
  const { url, method = "GET", params, body } = typeof args === "string" ? { url: args } : args;
  const [rawPath, rawQuery = ""] = url.replace(/^\/+/, "").split("?");
  const matched = router.match(method.toUpperCase(), rawPath.replace(/\/+$/, ""));
  if (!matched) return null;

  ensureSeeded();
  const query = new URLSearchParams(rawQuery);
  for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) if (v !== undefined && v !== null) query.set(k, String(v));

  await delay(120 + Math.random() * 230);
  try {
    const data = matched.handler({ method, path: rawPath, params: matched.params, query, body });
    return { data: structuredClone(data) };
  } catch (err) {
    if (err instanceof MockError) return { error: { status: err.status, data: { error: err.code, message: err.message } } };
    console.error("Mock API handler failed", err);
    return { error: { status: 500, data: { error: "mock_failure", message: "The mock API failed. See the console." } } };
  }
}
