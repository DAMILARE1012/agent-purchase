// Approving a payment with an email code, end to end: the code is sent by SMTP to Mailpit
// (the sandbox inbox), read back from Mailpit's API, and used to pay. Covers: the email says
// what it approves, resend cooldown, wrong codes, a code can't approve another cart, the
// receipt records the weaker approval, and bigger carts still need a passkey.
// Creates test data and spends sandbox money. Run with the stack up: node services/api/tests/smoke_email_approval.mjs
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
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
const tokens = { sam: await token("sam"), olivia: await token("olivia") };
const api = async (user, method, path, body) => {
  const headers = { "content-type": "application/json" };
  if (user) headers.authorization = `Bearer ${tokens[user]}`;
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mandate(overrides = {}, request = "HP 107a toner, under ₦40,000, from a verified seller") {
  const draft = (await api("sam", "POST", "/v1/mandates/draft", { request, mode: "present" })).body;
  const limits = { ...draft.limits, deliverBy: null, expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString(), ...overrides };
  return (await api("sam", "POST", "/v1/mandates", { draft, limits, signature: { kind: "test" } })).body;
}
async function cart(mandateId, spec = { sellerId: "s_ikeja_office", lines: [{ sku: "IOH-TNR-107A", quantity: 1 }] }) {
  return (await api("sam", "POST", "/v1/sandbox/runs", { mandateId, ...spec })).body;
}
/** The newest email to sam in Mailpit, after `since`. */
async function latestEmail(since) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:sam@example.com")}&limit=5`)).json();
    const msg = (list.messages ?? []).find((m) => Date.parse(m.Created) >= since);
    if (msg) return (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
    await sleep(250);
  }
  return null;
}
const codeIn = (email) => email?.Text?.match(/\b(\d{6})\b/)?.[1];

// Money for the test, the way a shopper adds it: a transfer in.
const balance = async () => (await api("sam", "GET", "/v1/wallet")).body.balanceMinor;
if ((await balance()) < 20_000_000) {
  await api("sam", "POST", "/v1/sandbox/inbound", { fromBankCode: "101", fromAccountNumber: "1010000014", amountMinor: 20_000_000, narration: "Test top-up" });
  await sleep(2000);
}

// ---- A cart within the limit ----
const a = await cart((await mandate()).id);
const methods = (await api("sam", "GET", `/v1/carts/${a.cart.id}/approval-methods`)).body;
check("small carts can be approved by email code", methods?.emailCode?.available === true && methods.passkey.available, methods);
check("the address is shown masked", /^s•+@example\.com$/.test(methods?.emailCode?.sentTo ?? ""), methods?.emailCode);

const since = Date.now() - 1000;
const sent = await api("sam", "POST", `/v1/carts/${a.cart.id}/email-code`);
check("code sent", sent.status === 200 && sent.body.expiresInSeconds === 300, sent);
const again = await api("sam", "POST", `/v1/carts/${a.cart.id}/email-code`);
check("a new code only after a minute", again.status === 429 && again.body.error === "email_code_too_soon", again);

const email = await latestEmail(since);
const code = codeIn(email);
check("the email arrived in the inbox (Mailpit)", !!email && !!code, email?.Subject);
check("the email says exactly what it approves", email?.Subject?.includes("₦38,500") && email?.Subject?.includes("IKEJA OFFICE HUB LTD")
  && email?.Text?.includes("HP 107A") && /expires in 5 minutes/.test(email?.Text ?? ""), email?.Subject);

const wrong = await api("sam", "POST", `/v1/carts/${a.cart.id}/approve`, { signature: { kind: "email_code", code: code === "000000" ? "111111" : "000000" } });
check("a wrong code is refused, with tries left", wrong.status === 400 && wrong.body.error === "email_code_wrong" && /4 tries left/.test(wrong.body.message), wrong);

// The same code can't approve a different cart.
const b = await cart((await mandate()).id);
const cross = await api("sam", "POST", `/v1/carts/${b.cart.id}/approve`, { signature: { kind: "email_code", code } });
check("a code for one cart can't approve another", cross.status === 400 && cross.body.error === "email_code_expired", cross);

const before = await balance();
const paid = await api("sam", "POST", `/v1/carts/${a.cart.id}/approve`, { signature: { kind: "email_code", code } });
check("the right code pays", paid.status === 200 && paid.body.status === "paid", paid);
check("the receipt records the email approval", paid.body?.receipt?.approvalKind === "email_code", paid.body?.receipt);
check("charged the cart total", before - (await balance()) === a.cart.totalMinor);
const verify = (await api(null, "GET", `/v1/receipts/verify?token=${encodeURIComponent(paid.body.receipt.token)}`)).body;
const approvalCheck = verify.checks.find((c) => c.label === "Shopper approved this cart");
check("receipt check: genuine, with the email approval marked weaker", verify.valid && approvalCheck?.result === "warn" && /email/.test(approvalCheck.detail), verify.checks);

// ---- A cart over the limit still needs a passkey ----
const catalog = (await api("olivia", "GET", "/v1/sellers/s_ada_provisions/catalog")).body;
const rice = catalog.find((i) => i.unitPriceMinor > 5_000_000);
const big = await cart((await mandate({ item: rice.name, brand: rice.brand, model: rice.model, category: rice.category, quantity: 1,
  sellerPolicy: "verified_and_known", maxTotalMinor: rice.unitPriceMinor + 1_000_000 }, `${rice.name}, under ₦${Math.ceil(rice.unitPriceMinor / 100) + 10_000}`)).id,
  { sellerId: "s_ada_provisions", lines: [{ sku: rice.sku, quantity: 1 }] });
const bigMethods = (await api("sam", "GET", `/v1/carts/${big.cart.id}/approval-methods`)).body;
check("carts over ₦50,000 can't use an email code", bigMethods.emailCode.available === false && /passkey/.test(bigMethods.emailCode.reason), bigMethods);
const bigSend = await api("sam", "POST", `/v1/carts/${big.cart.id}/email-code`);
check("no code is sent for them", bigSend.status === 409, bigSend);
const bigTry = await api("sam", "POST", `/v1/carts/${big.cart.id}/approve`, { signature: { kind: "email_code", code: "123456" } });
check("and an email-code approval is refused", bigTry.status === 403 && bigTry.body.error === "passkey_required", bigTry);

// Tidy up the carts left waiting.
for (const run of [b, big]) await api("sam", "POST", `/v1/carts/${run.cart.id}/decline`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
