// M7 end to end, through the real API: approving carts pays for them exactly once,
// within the mandate, with the gate run again at the moment of payment.
// Carts come from the sandbox endpoint (seller-signed, through the gate, no AI), so
// the concurrency tests can make many carts on one mandate without model calls.
// Covers: payment + receipt + ledger, public receipt check, 20 simultaneous clicks on
// one cart, 50 simultaneous approvals against a 5-purchase mandate, cancelling during
// payment, insufficient funds, the gate refusing at payment time, seller orders.
// Creates test data (mandates, purchases); spends sandbox money. Doesn't reset anything.
// Run with the stack up: node services/api/tests/smoke_payments.mjs
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo1234";
let failures = 0;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 600)}`);
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
const tokens = {};
for (const u of ["sam", "rita", "ada", "olivia", "kemi"]) tokens[u] = await token(u);
const api = async (user, method, path, body) => {
  const headers = { "content-type": "application/json" };
  if (user) headers.authorization = `Bearer ${tokens[user]}`;
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const TONER = { sellerId: "s_ikeja_office", lines: [{ sku: "IOH-TNR-107A", quantity: 1 }] };
const inTwoDays = new Date(Date.now() + 2 * 86400_000).toISOString();

async function mandate(user, overrides = {}, request = "HP 107a toner, under ₦40,000, from a verified seller") {
  const draft = (await api(user, "POST", "/v1/mandates/draft", { request, mode: "present" })).body;
  const limits = { ...draft.limits, deliverBy: null, expiresAt: inTwoDays, ...overrides };
  const res = await api(user, "POST", "/v1/mandates", { draft, limits, signature: { kind: "test" } });
  if (res.status !== 200) throw new Error(`mandate: ${JSON.stringify(res)}`);
  return res.body;
}
async function cart(user, mandateId, spec = TONER) {
  const res = await api(user, "POST", "/v1/sandbox/runs", { mandateId, ...spec });
  if (res.status !== 200) throw new Error(`sandbox cart: ${JSON.stringify(res)}`);
  return res.body;
}
const approve = (user, cartId, signature = { kind: "test" }) => api(user, "POST", `/v1/carts/${cartId}/approve`, { signature });
const balance = async (user) => (await api(user, "GET", "/v1/wallet")).body.balanceMinor;
const getMandate = async (user, id) => (await api(user, "GET", `/v1/mandates/${id}`)).body;

// A full run spends about ₦500,000. Top Sam up the way a shopper would: a transfer in from another bank.
async function ensureFunds(user, minor) {
  const have = await balance(user);
  if (have >= minor) return;
  const res = await api(user, "POST", "/v1/sandbox/inbound", { fromBankCode: "101", fromAccountNumber: "1010000014", amountMinor: minor - have, narration: "Test top-up" });
  if (res.status !== 200) throw new Error(`top-up: ${JSON.stringify(res)}`);
  for (let i = 0; i < 40 && (await balance(user)) < minor; i++) await new Promise((r) => setTimeout(r, 250));  // Credited by the network's webhook.
  console.log(`   topped ${user} up to ₦${(minor / 100).toLocaleString()} by bank transfer`);
}
await ensureFunds("sam", 80_000_000);

// ---- 1. Approve and pay ----
{
  const m = await mandate("sam");
  const run = await cart("sam", m.id);
  check("sandbox cart passes the gate and waits for approval", run.status === "awaiting_approval" && run.cart, run.status);
  const before = await balance("sam");
  const unsigned = await approve("sam", run.cart.id, { kind: "none" });
  check("approval without a passkey refused", unsigned.status === 403, unsigned);
  const forged = await approve("sam", run.cart.id, { kind: "passkey", challengeId: "nope", credential: { id: "x" } });
  check("approval with a bogus passkey assertion refused", forged.status === 400, forged);
  const paid = await approve("sam", run.cart.id);
  const p = paid.body;
  check("approval pays", paid.status === 200 && p.status === "paid", paid);
  check("paid the amount on the cart", p.totalMinor === run.cart.totalMinor, [p.totalMinor, run.cart.totalMinor]);
  check("receipt binds mandate, cart, gate and agent versions", p.receipt.token.startsWith("MG1.") && p.receipt.mandateHash === m.mandateHash
    && /^[0-9a-f]{64}$/.test(p.receipt.cartHash) && p.receipt.gateVersion && p.receipt.agentVersion, p.receipt);
  check("bank session ID recorded", p.receipt.networkSessionId.length > 0, p.receipt);
  check("balance went down by exactly the total", before - (await balance("sam")) === p.totalMinor, { before, total: p.totalMinor });
  const after = await getMandate("sam", m.id);
  check("single-use mandate is used up", after.status === "used_up" && after.uses === 1 && after.spentMinor === p.totalMinor, after);
  const runAfter = (await api("sam", "GET", `/v1/runs/${run.id}`)).body;
  check("run ends paid, with a payment step", runAfter.status === "paid" && runAfter.purchaseId === p.id && runAfter.steps.some((s) => s.kind === "payment"), runAfter.status);
  const again = await approve("sam", run.cart.id);
  check("approving again returns the same purchase", again.status === 200 && again.body.id === p.id, again);
  check("purchase listed", (await api("sam", "GET", "/v1/purchases")).body.some((x) => x.id === p.id));

  const verified = await api(null, "GET", `/v1/receipts/verify?token=${encodeURIComponent(p.receipt.token)}`);
  check("anyone can check the receipt, signed out", verified.status === 200 && verified.body.valid && verified.body.purchase.id === p.id, verified);
  check("receipt check re-derives seller cart and bank payment", ["Seller's cart", "Bank payment", "Gate decision"].every((l) => verified.body.checks.find((c) => c.label === l)?.result === "pass"), verified.body.checks);
  const [pre, body, sig] = p.receipt.token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url"));
  payload.amt = payload.amt * 10;
  const tampered = [pre, Buffer.from(JSON.stringify(payload)).toString("base64url"), sig].join(".");
  const bad = (await api(null, "GET", `/v1/receipts/verify?token=${encodeURIComponent(tampered)}`)).body;
  check("a receipt with a changed amount fails", bad.valid === false && bad.purchase === null, bad);
}

// ---- 1b. Declining: nothing paid, and a declined cart can't be approved later ----
{
  const m = await mandate("sam");
  const run = await cart("sam", m.id);
  const before = await balance("sam");
  const declined = (await api("sam", "POST", `/v1/carts/${run.cart.id}/decline`)).body;
  check("decline", declined.status === "declined", declined.status);
  const late = await approve("sam", run.cart.id);
  check("a declined cart can't be approved", late.status === 409 && late.body.error === "not_awaiting_approval", late);
  check("nothing paid", (await balance("sam")) === before);
}

// ---- 2. Twenty simultaneous clicks on one cart: one payment ----
{
  const m = await mandate("sam");
  const run = await cart("sam", m.id);
  const before = await balance("sam");
  const results = await Promise.all(Array.from({ length: 20 }, () => approve("sam", run.cart.id)));
  const ids = new Set(results.filter((r) => r.status === 200).map((r) => r.body.id));
  check("20 simultaneous approvals: all answered with one purchase", ids.size === 1 && results.every((r) => r.status === 200), results.map((r) => r.status));
  check("charged once", before - (await balance("sam")) === run.cart.totalMinor, { before, after: await balance("sam") });
  check("mandate used once", (await getMandate("sam", m.id)).uses === 1);
}

// ---- 3. Fifty simultaneous approvals against a mandate allowing 5 purchases ----
{
  const m = await mandate("sam", { maxUses: 5 });
  const runs = [];
  for (let i = 0; i < 50; i++) runs.push(await cart("sam", m.id));
  check("50 carts waiting on one mandate", runs.every((r) => r.status === "awaiting_approval"), runs.map((r) => r.status));
  const before = await balance("sam");
  const results = await Promise.all(runs.map((r) => approve("sam", r.cart.id)));
  const ok = results.filter((r) => r.status === 200);
  const refused = results.filter((r) => r.status === 409 && r.body.error === "gate_refused");
  check("exactly 5 paid", ok.length === 5, results.map((r) => r.status));
  check("the other 45 refused by the gate, with reasons", refused.length === 45 && refused.every((r) => r.body.decision.checks.some((c) => c.rule === "mandate_valid" && c.result === "fail")), refused[0]);
  const after = await getMandate("sam", m.id);
  const total = runs[0].cart.totalMinor;
  check("mandate: 5 uses, 5 × total spent, used up", after.uses === 5 && after.spentMinor === 5 * total && after.status === "used_up", after);
  check("balance went down by exactly 5 purchases", before - (await balance("sam")) === 5 * total, { before, after: await balance("sam"), total });
  const purchases = (await api("sam", "GET", "/v1/purchases")).body.filter((p) => p.mandateId === m.id);
  check("5 purchases recorded, all paid", purchases.length === 5 && purchases.every((p) => p.status === "paid"), purchases.length);
}

// ---- 4. Cancelling the mandate while approvals are in flight ----
{
  const m = await mandate("sam", { maxUses: 10 });
  const runs = [];
  for (let i = 0; i < 10; i++) runs.push(await cart("sam", m.id));
  const approvals = runs.map((r, i) => new Promise((res) => setTimeout(res, i * 15)).then(() => approve("sam", r.cart.id)));
  const revoke = new Promise((res) => setTimeout(res, 60)).then(() => api("sam", "POST", `/v1/mandates/${m.id}/revoke`));
  const [results, revoked] = [await Promise.all(approvals), await revoke];
  const after = await getMandate("sam", m.id);
  const ok = results.filter((r) => r.status === 200);
  check("mandate cancelled", revoked.status === 200 && after.status === "revoked", after.status);
  check("paid only before the cancellation took effect", ok.every((r) => Date.parse(r.body.receipt.issuedAt) <= Date.parse(after.revokedAt)), ok.map((r) => r.body.receipt.issuedAt).concat(after.revokedAt));
  check("every other approval refused", results.every((r) => r.status === 200 || r.status === 409), results.map((r) => r.status));
  check("uses match payments", after.uses === ok.length, { uses: after.uses, paid: ok.length });
  console.log(`   ${ok.length} paid before the cancellation, ${results.length - ok.length} refused after`);
}

// ---- 5. Not enough money: nothing held, nothing used ----
{
  const m = await mandate("rita", { maxUses: 5 });
  let refusedForFunds = null;
  for (let i = 0; i < 5 && !refusedForFunds; i++) {
    const run = await cart("rita", m.id);
    const before = await balance("rita");
    const usesBefore = (await getMandate("rita", m.id)).uses;
    const res = await approve("rita", run.cart.id);
    if (res.status === 422) refusedForFunds = { res, run, before, usesBefore };
    else if (res.status !== 200) { check("rita's approval", false, res); break; }
  }
  check("approval refused when the balance is too low", refusedForFunds?.res.body.error === "insufficient_funds", refusedForFunds?.res);
  if (refusedForFunds) {
    const { run, before, usesBefore } = refusedForFunds;
    check("nothing held from the balance", (await balance("rita")) === before);
    check("no mandate use taken", (await getMandate("rita", m.id)).uses === usesBefore);
    check("cart still waiting (add money, approve again)", (await api("rita", "GET", `/v1/runs/${run.id}`)).body.status === "awaiting_approval");
  }
}

// ---- 6. The gate runs again at payment: a seller suspended after the cart was proposed ----
{
  const m = await mandate("sam");
  const run = await cart("sam", m.id);
  const before = await balance("sam");
  try {
    await api("kemi", "POST", "/v1/admin/sellers/s_ikeja_office/tier", { tier: "suspended" });
    const res = await approve("sam", run.cart.id);
    check("gate refuses at payment when the seller was suspended meanwhile", res.status === 409 && res.body.error === "gate_refused"
      && res.body.decision.checks.some((c) => c.rule === "seller_allowed" && c.result === "fail"), res);
  } finally {
    await api("kemi", "POST", "/v1/admin/sellers/s_ikeja_office/tier", { tier: "verified" });
  }
  check("nothing paid", (await balance("sam")) === before);
  const after = (await api("sam", "GET", `/v1/runs/${run.id}`)).body;
  check("run ends blocked, with the reason", after.status === "blocked" && /refused the payment/.test(after.outcomeNote), after.outcomeNote);
  check("mandate untouched", (await getMandate("sam", m.id)).uses === 0);
}

// ---- 7. The seller sees paid orders ----
{
  const catalog = (await api("olivia", "GET", "/v1/sellers/s_ada_provisions/catalog")).body;
  const item = catalog.find((i) => i.inStock !== false);
  const m = await mandate("sam", { item: item.name, brand: item.brand, model: item.model, category: item.category, quantity: 1, sellerPolicy: "verified_and_known",
    maxTotalMinor: item.unitPriceMinor + 1_000_000 }, `${item.name}, under ₦${Math.ceil(item.unitPriceMinor / 100) + 10_000}`);
  const run = await cart("sam", m.id, { sellerId: "s_ada_provisions", lines: [{ sku: item.sku, quantity: 1 }] });
  check("cart from Ada's Provisions waits for approval", run.status === "awaiting_approval", [run.status, run.decision?.checks.filter((c) => c.result === "fail")]);
  const paid = await approve("sam", run.cart.id);
  check("paid Ada's Provisions", paid.status === 200 && paid.body.status === "paid", paid);
  const orders = (await api("ada", "GET", "/v1/seller/orders")).body;
  const order = orders.find((o) => o.purchaseId === paid.body.id);
  check("seller sees the paid order with its receipt", order && order.receiptToken === paid.body.receipt.token && order.status === "to_fulfil", orders.slice(0, 2));
  check("seller sees the shopper's name only because the mandate shares it", order?.shopperName === "Sam Carter", order);
  const refund = await api("ada", "POST", `/v1/seller/orders/${order?.id}/refund`);
  check("refunds explain they arrive in M12", refund.status === 409 && refund.body.error === "refunds_not_enabled", refund);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
