// End-to-end smoke test against the running stack (docker compose up).
// Signs in real Keycloak users (dev-only password grant on the scan-cli client)
// and exercises the API directly. Run: node services/api/tests/smoke_api.mjs
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080/realms/scan-to-confirm";
let failures = 0;
const tokens = {};

async function tokenFor(username) {
  if (tokens[username]) return tokens[username];
  const res = await fetch(`${KC}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "scan-cli", username, password: "demo1234" }),
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  return (tokens[username] = (await res.json()).access_token);
}

async function call(user, method, path, body, headers = {}) {
  const auth = user ? { authorization: `Bearer ${await tokenFor(user)}` } : {};
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...auth, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`);
  if (!cond) failures++;
}
const key = () => ({ "Idempotency-Key": crypto.randomUUID() });

// 0. Auth.
check("anonymous /me is guest", (await call(null, "GET", "/v1/me")).json.authenticated === false);
check("garbage token rejected", (await call(null, "GET", "/v1/me", null, { authorization: "Bearer nope" })).status === 401);
check("wallet requires sign-in", (await call(null, "GET", "/v1/wallet")).status === 401);

await call("olivia", "POST", "/v1/sandbox/reset");

// 1. Scenarios.
const scenarios = (await call(null, "GET", "/v1/sandbox/scenarios")).json;
const expected = {
  genuine: ["VERIFIED", [], []],
  edited: ["SUSPICIOUS", ["text_mismatch"], []],
  forged: ["SUSPICIOUS", ["bad_signature"], []],
  "recycled-confirmed": ["SUSPICIOUS", ["already_confirmed"], []],
  "recycled-checked": ["VERIFIED", [], ["previously_checked", "old_receipt"]],
  reversed: ["SUSPICIOUS", ["reversed"], []],
  pending: ["PENDING", [], []],
  "someone-else": ["VERIFIED", [], ["not_your_payment"]],
  public: ["VERIFIED", [], []],
};
for (const s of scenarios) {
  const r = (await call(s.viewerUsername || null, "POST", "/v1/scans", s.request)).json;
  const [verdict, reasons, warnings] = expected[s.id];
  const got = { verdict: r.verdict, reasons: r.reasons, warnings: r.warnings?.map((w) => w.code), view: r.view, message: r.message };
  check(`scenario ${s.id}: ${verdict}`, r.verdict === verdict && JSON.stringify(r.reasons) === JSON.stringify(reasons) && JSON.stringify(got.warnings) === JSON.stringify(warnings), got);
  if (s.id === "public") check("public view hides names", r.view === "public" && r.transfer.payerName === null && !r.canConfirm, r);
  if (s.id === "genuine") check("payee can confirm and refund", r.canConfirm && r.canRefund, r);
}
const genuine = scenarios.find((s) => s.id === "genuine");

let again = (await call("rita", "POST", "/v1/scans", genuine.request)).json;
check("second check warns previously_checked", again.warnings.some((w) => w.code === "previously_checked"), again.warnings);
const up = (await call("rita", "POST", "/v1/scans", { token: genuine.request.token, source: "upload" })).json;
check("upload without vision → visual_check_unavailable", up.warnings.some((w) => w.code === "visual_check_unavailable"), up.warnings);

const [p, payload, sig] = genuine.request.token.split(".");
const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
decoded.amt = 999999;
const tampered = [p, Buffer.from(JSON.stringify(decoded)).toString("base64url"), sig].join(".");
const t = (await call(null, "POST", "/v1/scans", { token: tampered, source: "paste" })).json;
check("edited payload fails signature", t.reasons?.[0] === "bad_signature", t);
check("no QR → no_qr", (await call(null, "POST", "/v1/scans", { token: null, source: "upload" })).json.reasons[0] === "no_qr");

// 2. Confirm, then recycled.
const tx = again.transfer.tx;
check("confirm works", (await call("rita", "POST", `/v1/transfers/${tx}/confirm`)).status === 200);
check("second confirm rejected", (await call("rita", "POST", `/v1/transfers/${tx}/confirm`)).status === 409);
check("payer can't confirm", (await call("sam", "POST", `/v1/transfers/${tx}/confirm`)).status === 403);
again = (await call("rita", "POST", "/v1/scans", genuine.request)).json;
check("after confirm → already_confirmed", again.reasons[0] === "already_confirmed", again);

// 3. Transfers.
const people = (await call("sam", "GET", "/v1/users")).json;
const rita = people.find((x) => x.handle === "@rita");
const ada = people.find((x) => x.handle === "@adasbakery" || x.handle === "@ada");
const bal0 = (await call("sam", "GET", "/v1/wallet")).json.balanceMinor;
const k = key();
const low1 = await call("sam", "POST", "/v1/transfers", { toUserId: rita.userId, amountMinor: 1500, note: "Coffee" }, k);
const low2 = await call("sam", "POST", "/v1/transfers", { toUserId: rita.userId, amountMinor: 1500, note: "Coffee" }, k);
check("low-risk transfer settles", low1.json.next === "done" && low1.json.transfer.status === "settled", low1.json);
check("idempotent retry returns same tx", low1.json.transfer?.tx === low2.json.transfer?.tx, [low1.json, low2.json]);
check("balance debited once", bal0 - (await call("sam", "GET", "/v1/wallet")).json.balanceMinor === 1500);
check("missing Idempotency-Key rejected", (await call("sam", "POST", "/v1/transfers", { toUserId: rita.userId, amountMinor: 100 })).status === 400);
const rcpt = await call("sam", "GET", `/v1/transfers/${low1.json.transfer.tx}/receipt`);
check("receipt URL points at web app", rcpt.json.url?.startsWith("http://localhost:3000/r#RCPT1."), rcpt.json);
check("strangers can't read the receipt", (await call("jordan", "GET", `/v1/transfers/${low1.json.transfer.tx}/receipt`)).status === 404);

const big = await call("sam", "POST", "/v1/transfers", { toUserId: rita.userId, amountMinor: 120000 }, key());
check("large transfer needs step-up", big.json.next === "step_up_required", big.json);
check("wrong step-up code rejected", (await call("sam", "POST", `/v1/transfers/${big.json.transfer.tx}/step-up`, { code: "000000" })).status === 422);
const ok = await call("sam", "POST", `/v1/transfers/${big.json.transfer.tx}/step-up`, { code: "123456" });
check("step-up settles", ok.json.status === "settled", ok.json);
const broke = await call("sam", "POST", "/v1/transfers", { toUserId: ada.userId, amountMinor: 999999999 }, key());
check("insufficient funds rejected", broke.status === 422 && broke.json.error === "insufficient_funds", broke.json);

const jordanPeople = (await call("jordan", "GET", "/v1/users")).json;
const held = await call("jordan", "POST", "/v1/transfers", { toUserId: jordanPeople.find((x) => x.handle === "@sam").userId, amountMinor: 120000 }, key());
check("flagged account's large payment is held", held.json.next === "held", held.json);

// 4. Refund protection: Jordan "overpaid" Rita $500; Rita refunds $400; payment reversed.
const list = (await call("rita", "GET", "/v1/transfers")).json;
const overpaid = list.find((x) => x.note === "Sorry, sent too much!");
const ritaBefore = (await call("rita", "GET", "/v1/wallet")).json.balanceMinor;
check("refund above original rejected", (await call("rita", "POST", `/v1/transfers/${overpaid.tx}/refund`, { amountMinor: 60000 }, key())).status === 422);
const refund = await call("rita", "POST", `/v1/transfers/${overpaid.tx}/refund`, { amountMinor: 40000 }, key());
check("refund created and linked", refund.json.kind === "refund" && refund.json.refundOf === overpaid.tx, refund.json);
await call("rita", "POST", `/v1/sandbox/transfers/${overpaid.tx}/reverse`);
const ritaAfter = (await call("rita", "GET", "/v1/wallet")).json.balanceMinor;
check("reversal takes only what Rita still holds ($100)", ritaBefore - ritaAfter === 50000, { ritaBefore, ritaAfter });
const pending = list.find((x) => x.status === "pending");
check("refund of pending payment blocked", (await call("rita", "POST", `/v1/transfers/${pending.tx}/refund`, { amountMinor: 100 }, key())).status === 409);

// 5. Roles.
check("member can't open risk console", (await call("rita", "GET", "/v1/cases")).status === 403);
check("analyst can't open the ledger", (await call("morgan", "GET", "/v1/ledger/summary")).status === 403);
check("analyst has no wallet", (await call("morgan", "GET", "/v1/wallet")).status === 403);
const cases = (await call("morgan", "GET", "/v1/cases")).json;
const heldCase = cases.find((c) => c.kind === "held_transfer" && c.status === "open");
const detail = (await call("morgan", "GET", `/v1/cases/${heldCase.id}`)).json;
const ids = new Set(detail.evidence.map((e) => e.id));
check("copilot citations all resolve", detail.copilot.sentences.length > 0 && detail.copilot.sentences.every((s) => s.cites.every((c) => ids.has(c))), detail.copilot);
const dec = await call("morgan", "POST", `/v1/cases/${heldCase.id}/decision`, { decision: "cancel" });
check("analyst cancel resolves case", dec.json.status === "resolved", dec.json);

// 6. Platform ledger (ops).
const summary = (await call("olivia", "GET", "/v1/ledger/summary")).json;
check("ledger balances (DR = CR)", summary.balanced && summary.totalDebitsMinor === summary.totalCreditsMinor, summary);
const accounts = (await call("olivia", "GET", "/v1/ledger/accounts")).json;
const sumBalances = accounts.reduce((s, a) => s + a.balanceMinor, 0);
check("all account balances sum to zero", sumBalances === 0, sumBalances);
const journal = (await call("olivia", "GET", `/v1/ledger/journal?tx=${overpaid.tx}`)).json;
check("journal shows payment and reversal for tx", journal.entries.length === 2 && journal.entries.every((e) => e.lines.length >= 2), journal);
const page1 = (await call("olivia", "GET", "/v1/ledger/journal?limit=5")).json;
const page2 = (await call("olivia", "GET", `/v1/ledger/journal?limit=5&before=${encodeURIComponent(page1.nextBefore)}`)).json;
check("journal pagination has no overlap", page2.entries.length > 0 && !page2.entries.some((e) => page1.entries.some((x) => x.id === e.id)), [page1.nextBefore]);

// 7. JWKS.
const jwks = (await call(null, "GET", "/.well-known/receipt-keys.json")).json;
check("JWKS publishes Ed25519 key", jwks.keys?.[0]?.crv === "Ed25519", jwks);

await call("olivia", "POST", "/v1/sandbox/reset");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
