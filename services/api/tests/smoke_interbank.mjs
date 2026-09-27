// End-to-end test of inter-bank payments against the running stack.
// Creates two throwaway users in Keycloak, so existing demo data is not touched or reset.
// Run: node services/api/tests/smoke_interbank.mjs   (takes ~90 s: it waits for delayed network outcomes)
import { createHmac } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM ?? "scan-to-confirm";
const ADMIN = [process.env.KEYCLOAK_ADMIN_USER ?? "admin", process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin"];
const PASSWORD = "Test-" + Math.random().toString(36).slice(2, 10);
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`);
  if (!cond) failures++;
}

async function form(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function createUser(username) {
  const { access_token } = await form(`${KC}/realms/master/protocol/openid-connect/token`, { grant_type: "password", client_id: "admin-cli", username: ADMIN[0], password: ADMIN[1] });
  const res = await fetch(`${KC}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@example.com`, firstName: "QA", lastName: username, enabled: true, emailVerified: true, credentials: [{ type: "password", value: PASSWORD, temporary: false }] }),
  });
  if (res.status !== 201) throw new Error(`create user: ${res.status} ${await res.text()}`);
  const { access_token: token } = await form(`${KC}/realms/${REALM}/protocol/openid-connect/token`, { grant_type: "password", client_id: "scan-cli", username, password: PASSWORD });
  return token;
}

function client(token) {
  return async (method, path, body, headers = {}) => {
    const res = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
}

const key = () => ({ "Idempotency-Key": crypto.randomUUID() });
const stamp = Date.now().toString(36);
const a = client(await createUser(`qa-a-${stamp}`));
const b = client(await createUser(`qa-b-${stamp}`));
const anon = client(null);

// Accounts and banks.
const walletA = (await a("GET", "/v1/wallet")).json;
const walletB = (await b("GET", "/v1/wallet")).json;
check("new wallet has a 10-digit account number", /^\d{10}$/.test(walletA.accountNumber ?? ""), walletA);
check("new wallet starts with $500 sandbox credit", walletA.balanceMinor === 50000, walletA);
const banks = (await a("GET", "/v1/banks")).json;
check("bank list has the platform first plus other banks", banks[0]?.isPlatform && banks.length >= 5, banks);

// Name enquiry.
const directory = (await a("GET", "/v1/sandbox/external-accounts")).json;
const maya = directory.find((x) => x.accountName === "Maya Chen");
const leo = directory.find((x) => x.accountName === "Leo Martins");
check("sandbox directory lists external account holders", Boolean(maya && leo), directory);
const typo = maya.accountNumber.slice(0, 9) + ((Number(maya.accountNumber[9]) + 1) % 10);
check("bad check digit caught before the network", (await a("POST", "/v1/name-enquiry", { bankCode: maya.bankCode, accountNumber: typo })).json.error === "invalid_account_number");
const ne = (await a("POST", "/v1/name-enquiry", { bankCode: maya.bankCode, accountNumber: maya.accountNumber })).json;
check("name enquiry at another bank returns the holder", ne.accountName === "Maya Chen" && ne.onPlatform === false && ne.bankName === "Aurora Bank", ne);
const neB = (await a("POST", "/v1/name-enquiry", { bankCode: banks[0].code, accountNumber: walletB.accountNumber })).json;
check("name enquiry on the platform returns the wallet owner", neB.onPlatform === true && neB.accountName.includes("qa-b"), neB);
check("name enquiry needs sign-in", (await anon("POST", "/v1/name-enquiry", { bankCode: maya.bankCode, accountNumber: maya.accountNumber })).status === 401);

// Internal payment by account number.
const internal = (await a("POST", "/v1/transfers", { bankCode: banks[0].code, accountNumber: walletB.accountNumber, amountMinor: 700, note: "QA internal" }, key())).json;
check("pay a platform wallet by account number", internal.transfer?.rail === "internal" && internal.transfer?.status === "settled", internal);

// Inter-bank: instant success.
const pay = (body) => a("POST", "/v1/transfers", { bankCode: maya.bankCode, accountNumber: maya.accountNumber, ...body }, key());
const ok = (await pay({ amountMinor: 1200, note: "QA instant" })).json;
check("inter-bank transfer settles on network confirmation", ok.transfer?.rail === "interbank" && ok.transfer.status === "settled" && ok.transfer.networkSessionId, ok);
check("payee shows as the external holder", ok.transfer?.payee.displayName === "Maya Chen" && ok.transfer.payee.bankName === "Aurora Bank", ok.transfer?.payee);

// Delayed outcomes.
const late = (await pay({ amountMinor: 513, note: "QA timeout then success" })).json;
const bad = (await pay({ amountMinor: 514, note: "QA timeout then fail" })).json;
const rev = (await pay({ amountMinor: 566, note: "QA success then reversal" })).json;
check("timeout leaves the payment pending (not failed)", late.transfer?.status === "pending" && bad.transfer?.status === "pending", [late.transfer?.status, bad.transfer?.status]);
check(".66 settles first", rev.transfer?.status === "settled", rev);
const afterSubmit = (await a("GET", "/v1/wallet")).json.balanceMinor;

// Receipt verification of an inter-bank payment, as someone not signed in.
const receipt = (await a("GET", `/v1/transfers/${ok.transfer.tx}/receipt`)).json;
const scan = (await anon("POST", "/v1/scans", { token: receipt.token, source: "link" })).json;
check("receipt verifies publicly with network wording", scan.verdict === "VERIFIED" && scan.checks.payee === "external" && /payment network/.test(scan.message), scan);
check("printed receipt names the payee's bank", /Aurora Bank ••••/.test(receipt.printed.payeeMasked), receipt.printed);

// Inbound from another bank.
const beforeIn = (await b("GET", "/v1/wallet")).json.balanceMinor;
const inbound = await b("POST", "/v1/sandbox/inbound", { fromBankCode: leo.bankCode, fromAccountNumber: leo.accountNumber, amountMinor: 2000, narration: "QA inbound" });
const afterIn = (await b("GET", "/v1/wallet")).json.balanceMinor;
check("money from another bank lands in the wallet", inbound.status === 200 && afterIn - beforeIn === 2000, [inbound, beforeIn, afterIn]);
const bList = (await b("GET", "/v1/transfers")).json;
const received = bList.find((t) => t.note === "QA inbound");
check("inbound shows the sender at their bank", received?.payer.displayName === "Leo Martins" && received.rail === "interbank", received);
check("inbound inter-bank payments can't be refunded here", (await b("POST", `/v1/transfers/${received.tx}/refund`, { amountMinor: 100 }, key())).json.error === "refund_unsupported");

// Webhook security.
const forged = await anon("POST", "/v1/network/events", { type: "inbound.credit", data: {} }, { "x-switch-signature": "t=1,v1=deadbeef" });
check("unsigned network webhook rejected", forged.status === 401, forged);
const secret = process.env.SWITCH_WEBHOOK_SECRET ?? "dev-switch-webhook-secret";
const body = JSON.stringify({ type: "nope", data: {} });
const t = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const signed = await fetch(`${API}/v1/network/events`, { method: "POST", headers: { "content-type": "application/json", "x-switch-signature": `t=${t},v1=${sig}` }, body });
check("correctly signed webhook accepted (unknown type → 422)", signed.status === 422, signed.status);

// Wait for the delayed outcomes (pending 30 s, reversal 60 s).
console.log("…waiting for the network's delayed outcomes");
let states = {};
for (let i = 0; i < 30; i++) {
  await sleep(3000);
  const list = (await a("GET", "/v1/transfers")).json;
  states = Object.fromEntries(list.filter((x) => x.note?.startsWith("QA ")).map((x) => [x.note, x.status]));
  if (states["QA timeout then success"] === "settled" && states["QA timeout then fail"] === "failed" && states["QA success then reversal"] === "reversed") break;
}
check("timed-out payment later settles", states["QA timeout then success"] === "settled", states);
check("timed-out payment later fails", states["QA timeout then fail"] === "failed", states);
check("reversal by recipient bank applied", states["QA success then reversal"] === "reversed", states);
const final = (await a("GET", "/v1/wallet")).json.balanceMinor;
check("failed and reversed amounts returned to the wallet", final - afterSubmit === 514 + 566, { afterSubmit, final });
const detail = (await a("GET", `/v1/transfers/${late.transfer.tx}`)).json;
check("network session ID recorded", Boolean(detail.transfer.networkSessionId) && detail.transfer.networkStatus === "successful", detail.transfer);

// Ledger (as ops).
const { access_token: ops } = await form(`${KC}/realms/${REALM}/protocol/openid-connect/token`, { grant_type: "password", client_id: "scan-cli", username: "olivia", password: process.env.DEMO_USER_PASSWORD ?? "demo1234" });
const olivia = client(ops);
const summary = (await olivia("GET", "/v1/ledger/summary")).json;
check("ledger still balances", summary.balanced === true, summary);
const accounts = (await olivia("GET", "/v1/ledger/accounts")).json;
check("network settlement account in use", accounts.some((x) => x.id === "acct_network" && x.debitsMinor + x.creditsMinor > 0), accounts.find((x) => x.id === "acct_network"));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
