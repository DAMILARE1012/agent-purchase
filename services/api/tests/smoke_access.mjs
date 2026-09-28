// M7 access tests, through the real API: every role is kept out of other people's
// mandates, carts, purchases and passkeys, and out of actions that aren't theirs.
// Sam (shopper) creates a mandate, a waiting cart and a paid purchase; then another
// shopper, a seller, the support analyst, ops, admin and a signed-out visitor try them.
// Creates test data (a mandate, a purchase). Run with the stack up: node services/api/tests/smoke_access.mjs
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo1234";
let failures = 0;
let checks = 0;

function check(name, cond, detail) {
  checks++;
  if (!cond) {
    console.log(`FAIL  ${name}  → ${JSON.stringify(detail).slice(0, 400)}`);
    failures++;
  }
}

async function token(username) {
  const res = await fetch(`${KC}/realms/scan-to-confirm/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "scan-cli", username, password: PASSWORD }),
  });
  return (await res.json()).access_token;
}
const USERS = ["sam", "rita", "ada", "morgan", "olivia", "kemi"];
const tokens = { guest: null };
for (const u of USERS) tokens[u] = await token(u);
const api = async (user, method, path, body) => {
  const headers = { "content-type": "application/json" };
  if (tokens[user]) headers.authorization = `Bearer ${tokens[user]}`;
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (path.endsWith("/events")) res.body?.cancel();
  return { status: res.status, body: path.endsWith("/events") ? null : await res.json().catch(() => null) };
};

// ---- Sam's data ----
const draft = (await api("sam", "POST", "/v1/mandates/draft", { request: "HP 107a toner, under ₦40,000, from a verified seller", mode: "present" })).body;
const limits = { ...draft.limits, deliverBy: null, maxUses: 3, expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString() };
const mandate = (await api("sam", "POST", "/v1/mandates", { draft, limits, signature: { kind: "test" } })).body;
const newCart = async () => (await api("sam", "POST", "/v1/sandbox/runs", { mandateId: mandate.id, sellerId: "s_ikeja_office", lines: [{ sku: "IOH-TNR-107A", quantity: 1 }] })).body;
const paidRun = await newCart();
const purchase = (await api("sam", "POST", `/v1/carts/${paidRun.cart.id}/approve`, { signature: { kind: "test" } })).body;
const waiting = await newCart();
const passkeyId = (await api("sam", "GET", "/v1/passkeys")).body[0]?.id;
if (!purchase?.id || waiting.status !== "awaiting_approval") throw new Error("couldn't set up Sam's data");

const M = mandate.id, R = waiting.id, C = waiting.cart.id, P = purchase.id;

// [method, path, body?] → the statuses each role may get. 404 hides that the thing exists; 403 is a role that never may; 401 is signed out.
const OWN_DATA = [
  ["GET", `/v1/mandates/${M}`],
  ["GET", `/v1/mandates/${M}/signature`],
  ["POST", `/v1/mandates/${M}/revoke`],
  ["GET", `/v1/runs/${R}`],
  ["GET", `/v1/runs/${R}/events`],
  ["POST", `/v1/carts/${C}/approval-options`],
  ["GET", `/v1/carts/${C}/approval-methods`],
  ["POST", `/v1/carts/${C}/email-code`],
  ["POST", `/v1/carts/${C}/approve`, { signature: { kind: "test" } }],
  ["POST", `/v1/carts/${C}/decline`],
  ["GET", `/v1/purchases/${P}`],
  ["POST", "/v1/sandbox/runs", { mandateId: M, sellerId: "s_ikeja_office", lines: [{ sku: "IOH-TNR-107A", quantity: 1 }] }],
  ...(passkeyId ? [["DELETE", `/v1/passkeys/${passkeyId}`]] : []),
];
const SHOPPER_ONLY = new Set(["/revoke", "/approval-options", "/approve", "/decline"].map((s) => s));
const isShopperOnly = (path) => [...SHOPPER_ONLY].some((s) => path.endsWith(s));
// Support and ops may read runs, mandates and purchases (to investigate), never act on them.
const STAFF_READS = { morgan: ["/v1/runs/", "/v1/mandates/", "/v1/purchases/"], olivia: ["/v1/runs/", "/v1/mandates/", "/v1/purchases/"], kemi: ["/v1/runs/"] };

for (const user of ["rita", "ada", "morgan", "olivia", "kemi", "guest"]) {
  for (const [method, path, body] of OWN_DATA) {
    const res = await api(user, method, path, body);
    const staffRead = method === "GET" && (STAFF_READS[user] ?? []).some((prefix) => path.startsWith(prefix));
    const allowed = user === "guest" ? [401] : staffRead ? [200] : user === "rita" ? [403, 404] : [403, 404];
    if (staffRead && path.endsWith("/signature")) allowed.push(200);
    check(`${user} ${method} ${path}`, allowed.includes(res.status), res);
    if (user === "rita" && !isShopperOnly(path)) check(`${user} can't tell ${path} exists`, res.status === 404, res);
  }
}

// Lists only ever show your own.
const ritaPurchases = (await api("rita", "GET", "/v1/purchases")).body;
check("rita's purchases don't include Sam's", Array.isArray(ritaPurchases) && !ritaPurchases.some((p) => p.id === P), ritaPurchases);
const ritaRuns = (await api("rita", "GET", "/v1/runs")).body;
check("rita's runs don't include Sam's", !ritaRuns.some((r) => r.id === R));
const ritaMandates = (await api("rita", "GET", "/v1/mandates")).body;
check("rita's mandates don't include Sam's", !ritaMandates.some((m) => m.id === M));
const adaOrders = (await api("ada", "GET", "/v1/seller/orders")).body;
check("a seller sees only their own store's orders", Array.isArray(adaOrders) && !adaOrders.some((o) => o.purchaseId === P), adaOrders.length);

// Role-only endpoints.
const ROLE_ONLY = [
  ["GET", "/v1/purchases", ["sam", "rita"]],
  ["GET", "/v1/mandates", ["sam", "rita"]],
  ["POST", "/v1/mandates/draft", ["sam", "rita"], { request: "rice", mode: "present" }],
  ["GET", "/v1/seller/orders", ["ada"]],
  ["POST", "/v1/seller/orders/o_x/refund", ["ada"]],
  ["GET", "/v1/support/blocked", ["morgan", "olivia", "kemi"]],
  ["GET", "/v1/ops/overview", ["morgan", "olivia", "kemi"]],
  ["GET", "/v1/ops/runs", ["morgan", "olivia", "kemi"]],
  ["POST", "/v1/admin/sellers/s_ikeja_office/tier", ["kemi"], { tier: "verified" }],
];
for (const [method, path, roles, body] of ROLE_ONLY) {
  for (const user of [...USERS, "guest"]) {
    const res = await api(user, method, path, body);
    const expected = user === "guest" ? [401] : roles.includes(user) ? null : [403];
    if (expected) check(`${user} ${method} ${path}`, expected.includes(res.status), res);
    else check(`${user} ${method} ${path} allowed`, res.status < 400 || (path.includes("refund") && res.status === 409), res);
  }
}

// Public by design: checking a receipt.
check("receipt check needs no sign-in", (await api("guest", "GET", `/v1/receipts/verify?token=${encodeURIComponent(purchase.receipt.token)}`)).body?.valid === true);
// Tidy up: decline Sam's waiting cart.
await api("sam", "POST", `/v1/carts/${C}/decline`);

console.log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nALL ${checks} ACCESS CHECKS PASSED`);
process.exit(failures ? 1 : 0);
