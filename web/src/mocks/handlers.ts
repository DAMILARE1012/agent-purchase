// The mock API. Each route here is served in the browser until the FastAPI
// service implements it; delete a route when the real endpoint ships.
// State lives in memory and resets when the page reloads.

import type { FetchArgs } from "@reduxjs/toolkit/query";
import type {
  AgentRun,
  BlockedCart,
  CreateMandateRequest,
  DraftMandateRequest,
  Mandate,
  OpsOverview,
  Purchase,
  ReceiptVerification,
  SellerOrder,
  SellerTier,
} from "@/types/domain";
import { formatMoney } from "@/lib/money";
import { compileDraft } from "./compile";
import {
  agentVersions, DEMO_SELLER_ID, disputes, evalResults, fakeHash, LIVE_VERSION, mandates, purchases,
  rangeReports, receiptFor, runs, seedRuns, sellers, catalog, SHOPPER, step, totals,
} from "./data";
import { decide } from "./gate";
import { MockError, Router, type MockRequest } from "./router";
import { advance, startRun } from "./simulate";

let seeded = false;
function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  seedRuns((m, c, at, periodSpentMinor) => decide(m, c, sellers, { at, periodSpentMinor }));
}

let seq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++seq).toString(36)}`;

const byNewest = <T,>(key: (t: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

function findOr404<T>(items: T[], pred: (t: T) => boolean, what: string): T {
  const found = items.find(pred);
  if (!found) throw new MockError(404, "not_found", `${what} not found.`);
  return found;
}

const liveRun = (r: AgentRun) => advance(r);

function periodSpent(m: Mandate): number {
  if (!m.limits.period) return 0;
  const since = Date.now() - (m.limits.period === "week" ? 7 : 30) * 86_400_000;
  return purchases.filter((p) => p.mandateId === m.id && Date.parse(p.paidAt) >= since).reduce((n, p) => n + p.totalMinor, 0);
}

function approve(req: MockRequest): Purchase {
  const run = findOr404(runs, (r) => r.cart?.id === req.params.cartId, "Cart");
  // Idempotent: approving twice returns the same purchase.
  if (run.purchaseId) return purchases.find((p) => p.id === run.purchaseId)!;
  if (run.status !== "awaiting_approval" || !run.cart) throw new MockError(409, "not_awaiting_approval", "This cart isn't waiting for approval.");

  const mandate = findOr404(mandates, (m) => m.id === run.mandateId, "Mandate");
  // The gate runs again at payment time; the earlier decision was only for display.
  const decision = decide(mandate, run.cart, sellers, { periodSpentMinor: periodSpent(mandate) });
  if (decision.outcome === "deny") {
    Object.assign(run, { status: "blocked", decision, endedAt: new Date().toISOString(), outcomeNote: "Something changed since the check. Nothing was paid" });
    throw new MockError(409, "gate_denied", "The gate refused this cart when re-checked. Nothing was paid.");
  }

  const paidAt = new Date().toISOString();
  const id = newId("p");
  const purchase: Purchase = {
    id, runId: run.id, mandateId: mandate.id, shopperName: run.shopperName, sellerId: run.cart.sellerId, sellerName: run.cart.sellerName,
    summary: run.cart.lines.map((l) => (l.quantity > 1 ? `${l.quantity} × ${l.name}` : l.name)).join(", "),
    totalMinor: run.cart.totalMinor, status: "paid", paidAt, payee: run.cart.payee,
    receipt: receiptFor(id, mandate.mandateHash, run.cart.id, `1000042${Date.now()}`.slice(0, 30).padEnd(30, "0"), paidAt),
  };
  purchases.push(purchase);
  mandate.uses += 1;
  mandate.spentMinor += purchase.totalMinor;
  if (mandate.uses >= mandate.limits.maxUses) mandate.status = "used_up";
  run.steps.push(step(0, "payment", `Paid ${formatMoney(run.cart.totalMinor)} to ${run.cart.payee.nameOnAccount} (${run.cart.payee.bankName} ${run.cart.payee.accountNumberMasked})`));
  Object.assign(run, { status: "paid", decision, purchaseId: id, endedAt: paidAt, totals: totals(run.steps) });
  return purchase;
}

function verifyReceipt(token: string): ReceiptVerification {
  const p = purchases.find((x) => x.receipt.token === token);
  if (!p) {
    return { valid: false, purchase: null, checks: [{ label: "Platform signature", result: "fail", detail: "This receipt wasn't issued by the platform, or it was altered." }] };
  }
  return {
    valid: true,
    purchase: { id: p.id, sellerName: p.sellerName, summary: p.summary, totalMinor: p.totalMinor, status: p.status, paidAt: p.paidAt },
    checks: [
      { label: "Platform signature", result: "pass", detail: `Signed with key ${p.receipt.signingKeyId}` },
      { label: "Shopper's mandate", result: "pass", detail: `Purchase is bound to mandate ${p.receipt.mandateHash.slice(0, 12)}…, signed by the shopper` },
      { label: "Gate decision", result: "pass", detail: `Allowed by ${p.receipt.gateVersion}` },
      { label: "Bank payment", result: p.status === "refunded" ? "warn" : "pass", detail: `Session ID ${p.receipt.networkSessionId}${p.status === "refunded" ? " (refunded since)" : ""}` },
    ],
  };
}

function toOrder(p: Purchase): SellerOrder {
  const run = runs.find((r) => r.id === p.runId);
  return {
    id: `o_${p.id}`, purchaseId: p.id, shopperName: p.shopperName, summary: p.summary, totalMinor: p.totalMinor,
    paidAt: p.paidAt, deliverBy: run?.cart?.deliveryBy ?? p.paidAt,
    status: p.status === "refunded" ? "refunded" : Date.parse(run?.cart?.deliveryBy ?? p.paidAt) < Date.now() ? "delivered" : "to_fulfil",
  };
}

function toBlocked(r: AgentRun): BlockedCart {
  const seller = sellers.find((s) => s.id === r.cart!.sellerId);
  return {
    runId: r.id, shopperName: r.shopperName, sellerId: r.cart!.sellerId, sellerName: r.cart!.sellerName, totalMinor: r.cart!.totalMinor,
    failedRules: r.decision!.checks.filter((c) => c.result === "fail").map((c) => c.rule),
    decidedAt: r.decision!.decidedAt, sellerAdversarial: !!seller?.adversarial,
  };
}

function overview(): OpsOverview {
  const dayAgo = Date.now() - 86_400_000;
  const today = runs.filter((r) => Date.parse(r.startedAt) >= dayAgo);
  const paid = runs.filter((r) => r.purchaseId);
  const secs = runs.filter((r) => r.endedAt).map((r) => (Date.parse(r.endedAt!) - Date.parse(r.startedAt)) / 1000).sort((a, b) => a - b);
  return {
    runsToday: today.length,
    purchasesToday: purchases.filter((p) => Date.parse(p.paidAt) >= dayAgo).length,
    blockedToday: today.filter((r) => r.status === "blocked").length,
    violations: 0,
    p95RunSeconds: secs.length ? Math.min(secs[Math.floor(secs.length * 0.95)] ?? secs.at(-1)!, 58) : 0,
    costPerPurchaseMicroUsd: paid.length ? Math.round(runs.reduce((n, r) => n + r.totals.costMicroUsd, 0) / paid.length) : 0,
    queueDepth: runs.filter((r) => r.status === "queued").length,
    fallbackRate: 0.012,
    liveVersion: LIVE_VERSION,
  };
}

const router = new Router()
  // Mandates
  .on("GET", "mandates", () => [...mandates].sort(byNewest((m) => m.createdAt)))
  .on("GET", "mandates/:id", ({ params }) => findOr404(mandates, (m) => m.id === params.id, "Mandate"))
  .on("POST", "mandates/draft", ({ body }) => {
    const { request, mode } = body as DraftMandateRequest;
    if (!request?.trim()) throw new MockError(422, "empty_request", "Say what you want to buy.");
    return compileDraft(request, mode);
  })
  .on("POST", "mandates", ({ body }) => {
    const { draft, limits, assertion } = body as CreateMandateRequest;
    if (!assertion) throw new MockError(422, "unsigned", "Approve the mandate with your passkey first.");
    if (limits.maxTotalMinor <= 0) throw new MockError(422, "no_budget", "Set a maximum total before signing.");
    const now = new Date().toISOString();
    const mandate: Mandate = {
      id: newId("m"), status: "active", mode: draft.mode, request: draft.request, limits, uses: 0, spentMinor: 0,
      mandateHash: fakeHash(JSON.stringify(limits)), signedAt: now, revokedAt: null, createdAt: now, runIds: [],
    };
    mandates.push(mandate);
    return mandate;
  })
  .on("POST", "mandates/:id/revoke", ({ params }) => {
    const m = findOr404(mandates, (x) => x.id === params.id, "Mandate");
    if (m.status === "active") Object.assign(m, { status: "revoked", revokedAt: new Date().toISOString() });
    for (const r of runs.filter((x) => x.mandateId === m.id && ["queued", "running", "awaiting_approval"].includes(x.status))) {
      Object.assign(r, { status: "declined", endedAt: new Date().toISOString(), outcomeNote: "Mandate cancelled. Nothing was paid" });
    }
    return m;
  })
  // Runs
  .on("GET", "runs", ({ query }) => {
    const mandateId = query.get("mandateId");
    return runs.filter((r) => r.shopperName === SHOPPER && (!mandateId || r.mandateId === mandateId)).map(liveRun).sort(byNewest((r) => r.startedAt));
  })
  .on("GET", "runs/:id", ({ params }) => liveRun(findOr404(runs, (r) => r.id === params.id, "Run")))
  .on("POST", "runs", ({ body }) => {
    const { mandateId } = body as { mandateId: string };
    const m = findOr404(mandates, (x) => x.id === mandateId, "Mandate");
    if (m.status !== "active") throw new MockError(409, "mandate_inactive", "This mandate can't be used any more.");
    const busy = runs.find((r) => r.mandateId === m.id && ["queued", "running", "awaiting_approval"].includes(liveRun(r).status));
    if (busy && m.limits.maxUses - m.uses <= 1) throw new MockError(409, "run_in_progress", "A run for this mandate is already in progress.");
    const run = startRun(m, newId("r"));
    runs.push(run);
    m.runIds.push(run.id);
    return run;
  })
  .on("POST", "carts/:cartId/approve", approve)
  .on("POST", "carts/:cartId/decline", ({ params }) => {
    const run = findOr404(runs, (r) => r.cart?.id === params.cartId, "Cart");
    if (run.status === "awaiting_approval") Object.assign(run, { status: "declined", endedAt: new Date().toISOString(), outcomeNote: "You declined the cart. Nothing was paid" });
    return run;
  })
  // Purchases and receipts
  .on("GET", "purchases", () => purchases.filter((p) => p.shopperName === SHOPPER).sort(byNewest((p) => p.paidAt)))
  .on("GET", "purchases/:id", ({ params }) => findOr404(purchases, (p) => p.id === params.id, "Purchase"))
  .on("GET", "receipts/verify", ({ query }) => verifyReceipt(query.get("token") ?? ""))
  // Seller directory
  .on("GET", "sellers", () => sellers)
  .on("GET", "sellers/:id", ({ params }) => findOr404(sellers, (s) => s.id === params.id, "Seller"))
  .on("GET", "sellers/:id/catalog", ({ params }) => catalog.filter((c) => c.sellerId === params.id))
  // Seller workspace (the demo seller manages Ada's Provisions)
  .on("GET", "seller/profile", () => findOr404(sellers, (s) => s.id === DEMO_SELLER_ID, "Seller"))
  .on("GET", "seller/catalog", () => catalog.filter((c) => c.sellerId === DEMO_SELLER_ID))
  .on("GET", "seller/orders", () => purchases.filter((p) => p.sellerId === DEMO_SELLER_ID).map(toOrder).sort(byNewest((o) => o.paidAt)))
  // Support
  .on("GET", "support/blocked", () => runs.filter((r) => r.decision?.outcome === "deny" && r.cart).map(toBlocked).sort(byNewest((b) => b.decidedAt)))
  .on("GET", "support/disputes", () => disputes)
  // Ops
  .on("GET", "ops/overview", overview)
  .on("GET", "ops/runs", () => runs.map(liveRun).sort(byNewest((r) => r.startedAt)))
  .on("GET", "ops/agent-versions", () => agentVersions)
  .on("GET", "ops/evals", ({ query }) => evalResults.filter((e) => !query.get("versionId") || e.versionId === query.get("versionId")))
  .on("GET", "ops/range", () => rangeReports)
  // Admin
  .on("POST", "admin/sellers/:id/tier", ({ params, body }) => {
    const s = findOr404(sellers, (x) => x.id === params.id, "Seller");
    const { tier } = body as { tier: SellerTier };
    if (!["verified", "known", "new", "suspended"].includes(tier)) throw new MockError(422, "bad_tier", "Unknown tier.");
    s.tier = tier;
    return s;
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
