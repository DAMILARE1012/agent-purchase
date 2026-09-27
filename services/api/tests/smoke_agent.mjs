// M5 end to end, through the real API: a shopper signs a mandate, starts an AI
// shopping run, and follows it live over server-sent events until the gate decides.
// Covers: queue + worker, gateway (sandbox or Groq), traces, gate decisions,
// payee substitution caught, cancelling, ops views, SSE.
// Run with the stack up: node services/api/tests/smoke_agent.mjs
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo1234";
let failures = 0;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 500)}`);
  if (!cond) failures++;
}

async function token(username) {
  const res = await fetch(`${KC}/realms/scan-to-confirm/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "scan-cli", username, password: PASSWORD }),
  });
  return (await res.json()).access_token;
}
const tokens = { sam: await token("sam"), olivia: await token("olivia"), morgan: await token("morgan") };
const api = async (user, method, path, body) => {
  const res = await fetch(API + path, { method, headers: { authorization: `Bearer ${tokens[user]}`, "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/**
 * Follows a run's server-sent events until it stops running; returns every snapshot seen.
 * The timeout matches AGENT_RUN_TIMEOUT_SECONDS: at 7k tokens/minute, back-to-back runs wait for the window.
 */
async function follow(runId, timeoutMs = 300_000) {
  const res = await fetch(`${API}/v1/runs/${runId}/events`, { headers: { authorization: `Bearer ${tokens.sam}` }, signal: AbortSignal.timeout(timeoutMs) });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const snapshots = [];
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = event.split("\n").find((l) => l.startsWith("data: "));
      if (data) snapshots.push(JSON.parse(data.slice(6)));
    }
  }
  return snapshots;
}

async function mandateFor(request, overrides = {}) {
  const draft = (await api("sam", "POST", "/v1/mandates/draft", { request, mode: "present" })).body;
  const limits = { ...draft.limits, ...overrides };
  const created = await api("sam", "POST", "/v1/mandates", { draft, limits, signature: { kind: "test" } });
  return created.body;
}

// ---- 1. Draft and sign ----
const draft = (await api("sam", "POST", "/v1/mandates/draft", { request: "HP 107a toner, under ₦40,000, from a verified seller, delivered by Friday", mode: "present" })).body;
check("draft reads the request", draft.limits.brand === "HP" && draft.limits.model === "107A" && draft.limits.maxTotalMinor === 4_000_000, draft.limits);
const unsigned = await api("sam", "POST", "/v1/mandates", { draft, limits: draft.limits, signature: { kind: "none" } });
check("unsigned mandate refused", unsigned.status === 422, unsigned);
const noBudget = await api("sam", "POST", "/v1/mandates", { draft, limits: { ...draft.limits, maxTotalMinor: 0 }, signature: { kind: "test" } });
check("mandate without a budget refused", noBudget.status === 422, noBudget);
const mandate = (await api("sam", "POST", "/v1/mandates", { draft, limits: draft.limits, signature: { kind: "test" } })).body;
check("mandate signed with a server-side hash", mandate.status === "active" && /^[0-9a-f]{64}$/.test(mandate.mandateHash), mandate);

// ---- 2. Run, followed live ----
let run = (await api("sam", "POST", "/v1/runs", { mandateId: mandate.id })).body;
check("run starts queued", run.status === "queued", run);
const second = await api("sam", "POST", "/v1/runs", { mandateId: mandate.id });
check("one run at a time on a single-use mandate", second.status === 409, second);
let snaps = await follow(run.id);
check("live events streamed", snaps.length >= 3, snaps.map((s) => s.status));
run = snaps.at(-1);
check("run reached a gate decision", ["blocked", "awaiting_approval"].includes(run.status), run.status);
check("trace has model calls with tokens (cached answers marked)", run.steps.filter((s) => s.model && !s.cached).every((s) => s.tokensIn > 0) && run.steps.some((s) => s.model && !s.cached), run.steps);
check("seller content marked untrusted", run.steps.some((s) => s.untrusted), run.steps.map((s) => s.kind));
console.log("   run 1:", run.status, "·", run.cart?.sellerName, "·", run.steps.map((s) => s.kind).join(" → "));

// Keep shopping until the gate allows a cart (the sandbox script is fooled by dishonest sellers first).
const refusals = [];
for (let i = 0; i < 4 && run.status === "blocked"; i++) {
  refusals.push({ seller: run.cart?.sellerName, failed: run.decision?.checks.filter((c) => c.result === "fail").map((c) => c.rule) });
  run = (await api("sam", "POST", "/v1/runs", { mandateId: mandate.id })).body;
  snaps = await follow(run.id);
  run = snaps.at(-1);
  console.log(`   run ${i + 2}:`, run.status, "·", run.cart?.sellerName, "·", run.steps.map((s) => s.kind).join(" → "));
}
check("gate refused dishonest sellers along the way", refusals.every((r) => r.failed.length > 0), refusals);
if (refusals.some((r) => r.seller === "Toner King Official Store")) {
  check("payee substitution caught", refusals.find((r) => r.seller === "Toner King Official Store").failed.includes("payee_verified"), refusals);
}
check("eventually an allowed cart from a verified seller", run.status === "awaiting_approval" && run.decision?.outcome !== "deny", run);
check("cart payee confirmed by the bank", run.cart?.payee?.nameOnAccount?.length > 0 && run.cart.sellerSignatureValid === true, run.cart);

// ---- 3. Approving the AI's cart pays for it (M7; the payment edge cases are in smoke_payments.mjs) ----
const approve = await api("sam", "POST", `/v1/carts/${run.cart.id}/approve`, { signature: { kind: "test" } });
check("approving the AI's cart pays the seller", approve.status === 200 && approve.body.status === "paid" && approve.body.runId === run.id, approve);
const paidRun = (await api("sam", "GET", `/v1/runs/${run.id}`)).body;
check("run ends paid", paidRun.status === "paid" && paidRun.purchaseId === approve.body.id, paidRun.status);
const lateDecline = (await api("sam", "POST", `/v1/carts/${run.cart.id}/decline`)).body;
check("a paid cart can't be declined", lateDecline.status === "paid", lateDecline.status);

// ---- 4. Cancel a mandate while its run is queued or running ----
const m2 = await mandateFor("A 65W USB-C charger under ₦20,000 from a verified seller by Friday");
const r2 = (await api("sam", "POST", "/v1/runs", { mandateId: m2.id })).body;
await api("sam", "POST", `/v1/mandates/${m2.id}/revoke`);
const after = (await api("sam", "GET", `/v1/runs/${r2.id}`)).body;
await new Promise((r) => setTimeout(r, 3000));
const settled = (await api("sam", "GET", `/v1/runs/${r2.id}`)).body;
check("cancelling stops the run", after.status === "declined" && settled.status === "declined", [after.status, settled.status]);

// ---- 5. Staff views ----
const blocked = (await api("morgan", "GET", "/v1/support/blocked")).body;
check("support sees refused carts", Array.isArray(blocked) && (refusals.length === 0 || blocked.some((b) => b.failedRules.length)), blocked?.slice?.(0, 2));
const overview = (await api("olivia", "GET", "/v1/ops/overview")).body;
check("ops overview", overview.runsToday >= 2 && overview.purchasesToday >= 1 && overview.violations === 0 && overview.modelProvider, overview);
const versions = (await api("olivia", "GET", "/v1/ops/agent-versions")).body;
check("agent versions from the registry", versions.some((v) => v.status === "live") && versions.some((v) => v.status === "candidate"), versions.map((v) => v.id));
const trace = (await api("olivia", "GET", `/v1/runs/${run.id}`)).body;
check("ops can read any trace", trace.id === run.id);
check("shoppers can't read ops views", (await api("sam", "GET", "/v1/ops/runs")).status === 403);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
