// M4 "done when": browse the sandbox marketplace, get a signed cart, and verify
// its signature and payee account with the platform. Also checks that tampering,
// a wrong key and payee substitution are caught, and the seller directory,
// workspace and admin tiers work. Leaves data as it found it.
// Run with the stack up: node services/marketplace/tests/smoke_marketplace.mjs
const MARKET = process.env.MARKETPLACE_URL ?? "http://localhost:8200";
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo1234";
let failures = 0;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 400)}`);
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

const tokens = Object.fromEntries(await Promise.all(["olivia", "ada", "kemi", "sam"].map(async (u) => [u, await token(u)])));
const api = async (user, method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${tokens[user]}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const market = async (method, path, body) => {
  const res = await fetch(MARKET + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.arrayBuffer() };
};
const cartFor = async (sellerId, sku, quantity = 1, city = "Lagos") =>
  (await market("POST", `/v1/sellers/${sellerId}/carts`, { lines: [{ sku, quantity }], deliverToCity: city })).body;
const failed = (v) => v.checks.filter((c) => c.result === "fail").map((c) => c.rule);

// ---- Browse ----
const sellers = (await market("GET", "/v1/sellers")).body;
check("marketplace lists 20+ sellers", sellers.length >= 23, sellers.length);
const found = (await market("GET", "/v1/search?q=" + encodeURIComponent("HP 107A toner"))).body;
check("search finds structured toner listings", found.items.some((i) => i.sellerId === "s_ikeja_office" && i.sku === "IOH-TNR-107A"), found.items.map((i) => i.sku));
check("search returns photo catalogs to read", found.imageCatalogs.some((c) => c.sellerId === "s_printpoint"), found.imageCatalogs);
const photo = await market("GET", new URL(found.imageCatalogs[0].url).pathname);
check("catalog photo is a JPEG", photo.status === 200 && new Uint8Array(photo.body)[0] === 0xff && photo.body.byteLength > 10_000, photo.status);
const quote = (await market("POST", "/v1/sellers/s_ikeja_office/delivery-quote", { city: "Abuja" })).body;
check("delivery quote to another city", quote.deliveryFeeMinor > 200_000 && quote.deliveryBy, quote);

// ---- A genuine signed cart ----
const good = await cartFor("s_ikeja_office", "IOH-TNR-107A");
check("cart is signed and adds up", good.signature && good.cart.totalMinor === 3_850_000, good.cart);
const verdict = (await api("olivia", "POST", "/v1/carts/verify", good)).body;
check("platform verifies signature and payee", verdict.valid === true, verdict);
check("bank confirms the seller owns the account", verdict.payeeName?.toUpperCase() === "IKEJA OFFICE HUB LTD", verdict.payeeName);

// ---- What must be caught ----
const tampered = structuredClone(good);
tampered.cart.totalMinor -= 500_000;
tampered.cart.lines[0].lineTotalMinor -= 500_000;
tampered.cart.lines[0].unitPriceMinor -= 500_000;
const t = (await api("olivia", "POST", "/v1/carts/verify", tampered)).body;
check("tampered cart: signature fails", !t.valid && failed(t).includes("signature") && !failed(t).includes("arithmetic"), failed(t));

const swapped = await cartFor("s_toner_king", "TK-TNR-107A");
const s = (await api("olivia", "POST", "/v1/carts/verify", swapped)).body;
check("payee substitution: validly signed", !failed(s).includes("signature"), failed(s));
check("payee substitution: account not the seller's", failed(s).includes("payee_registered") && failed(s).includes("payee_name"), failed(s));
check("payee substitution: bank names the real holder", s.payeeName?.toUpperCase() === "ADEBAYO MUSA", s.payeeName);

const impostor = structuredClone(swapped);
impostor.cart.sellerId = "s_ikeja_office";
const i = (await api("olivia", "POST", "/v1/carts/verify", impostor)).body;
check("cart claiming another seller: signature fails", failed(i).includes("signature"), failed(i));

const unknown = (await api("olivia", "POST", "/v1/carts/verify", { cart: { sellerId: "s_nobody" }, signature: "x" })).body;
check("unknown seller refused", unknown.valid === false && failed(unknown).includes("seller_known"), unknown);

// ---- Directory, seller workspace, admin ----
const directory = (await api("olivia", "GET", "/v1/sellers")).body;
check("directory has every seller", directory.length === sellers.length, directory.length);
check("every seller's registered account is verified", directory.every((d) => d.accounts.some((a) => a.verifiedAt)), directory.filter((d) => !d.accounts.some((a) => a.verifiedAt)).map((d) => d.id));
check("shoppers can't read the directory", (await api("sam", "GET", "/v1/sellers")).status === 403);

const profile = (await api("ada", "GET", "/v1/seller/profile")).body;
check("ada's workspace is Ada's Provisions", profile.id === "s_ada_provisions", profile);
const catalog = (await api("ada", "GET", "/v1/seller/catalog")).body;
check("ada's catalog includes photo-only items", catalog.length === 6 && catalog.every((c) => c.source === "image"), catalog.map((c) => c.source));

const added = await api("ada", "POST", "/v1/seller/accounts", { bankCode: "103", accountNumber: "1030000010", nameOnAccount: "ADA OKORO ENTERPRISES" });
const priya = added.body?.accounts?.find((a) => a.accountNumberMasked.endsWith("0010"));
check("someone else's account is added but not verified", added.status === 200 && priya && !priya.verifiedAt && priya.nameOnAccount === "PRIYA NAIR", added);
const removed = await api("ada", "DELETE", "/v1/seller/accounts/103/1030000010");
check("seller removes the account", removed.status === 200 && !removed.body.accounts.some((a) => a.accountNumberMasked.endsWith("0010")), removed);
check("seller can't remove the last verified account", (await api("ada", "DELETE", "/v1/seller/accounts/103/1030000044")).status === 409);

const before = directory.find((d) => d.id === "s_toner_king").tier;
const suspended = (await api("kemi", "POST", "/v1/admin/sellers/s_toner_king/tier", { tier: "suspended" })).body;
check("admin suspends a seller", suspended.tier === "suspended", suspended);
const blocked = (await api("olivia", "POST", "/v1/carts/verify", await cartFor("s_toner_king", "TK-TNR-107A"))).body;
check("suspended seller's cart refused", failed(blocked).includes("seller_known"), failed(blocked));
await api("kemi", "POST", "/v1/admin/sellers/s_toner_king/tier", { tier: before });
check("only admins set tiers", (await api("olivia", "POST", "/v1/admin/sellers/s_toner_king/tier", { tier: "verified" })).status === 403);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
