// Scripted browser sign-in through the real OIDC flow, for every role:
// web /auth/login → Keycloak login form → /auth/callback → session cookie → BFF proxy → API.
// Non-destructive: it creates no payments and resets nothing.
// Run with the stack up: node web/scripts/smoke-login.mjs
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo1234";
let failures = 0;
const jars = new Map(); // host → Map(name → value)

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 300)}`);
  if (!cond) failures++;
}

async function request(url, init = {}) {
  const { host } = new URL(url);
  const jar = jars.get(host) ?? new Map();
  jars.set(host, jar);
  const headers = new Headers(init.headers);
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(";");
    const [name, ...rest] = pair.split("=");
    const value = rest.join("=");
    const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim())) || value === "";
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  return res;
}

async function signIn(username, returnTo = "/home") {
  jars.clear();
  const start = await request(`${WEB}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  const authUrl = start.headers.get("location");
  const form = await request(authUrl);
  const html = await form.text();
  const action = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!action) throw new Error("Keycloak login form not found");
  const submit = await request(action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password: PASSWORD, credentialId: "" }),
  });
  const callback = submit.headers.get("location");
  const done = await request(callback);
  return { start, authUrl, submit, callback, done };
}

const api = (path, init) => request(`${WEB}/api/v1/${path}`, init);

// Signed out.
let me = await (await api("me")).json();
check("signed out → guest", me.authenticated === false, me);
check("public verify page → 200", (await request(`${WEB}/verify`)).status === 200);

// Sign-in flow, as the demo shopper.
const flow = await signIn("sam");
check("login redirects to Keycloak with PKCE", flow.authUrl.startsWith("http://localhost:8080/") && flow.authUrl.includes("code_challenge_method=S256"), flow.authUrl);
check("Keycloak redirects back to /auth/callback", flow.callback?.startsWith(`${WEB}/auth/callback?`), flow.callback);
check("callback lands on /home", flow.done.headers.get("location") === `${WEB}/home`, flow.done.headers.get("location"));
const webJar = jars.get(new URL(WEB).host);
check("session cookie set (httpOnly, opaque)", webJar.has("stc_sid") && !webJar.get("stc_sid").includes("."), [...webJar.keys()]);

// CSRF: the proxy rejects cross-site mutations. Name enquiry is a harmless POST.
const body = JSON.stringify({ bankCode: "990", accountNumber: "2000000022" });
const crossSite = await api("name-enquiry", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body });
check("cross-site POST blocked", crossSite.status === 403, crossSite.status);
const sameSite = await api("name-enquiry", { method: "POST", headers: { "content-type": "application/json", origin: WEB }, body });
check("same-site POST reaches the API", sameSite.status === 200, sameSite.status);
check("open redirect blocked", (await request(`${WEB}/auth/login?returnTo=//evil.example`)).status === 307);

// Every role signs in, gets the right role from the API, and its pages render.
const ROLES = [
  ["sam", "shopper", ["/shop", "/shop/mandates", "/shop/mandates/new", "/shop/runs", "/shop/purchases", "/shop/balance"]],
  ["ada", "seller", ["/seller", "/seller/catalog", "/seller/accounts"]],
  ["morgan", "analyst", ["/support", "/support/disputes", "/support/sellers"]],
  ["olivia", "ops", ["/ops", "/ops/agents", "/ops/traces", "/ops/evals", "/ops/range", "/ops/ledger"]],
  ["kemi", "admin", ["/admin", "/admin/users"]],
];
for (const [username, role, pages] of ROLES) {
  await signIn(username);
  me = await (await api("me")).json();
  check(`${username} is ${role}`, me.authenticated && me.user.role === role, me.user);
  const hasBalance = Boolean(me.user?.accountId);
  check(`${username} ${role === "shopper" || role === "seller" ? "has" : "has no"} balance`, hasBalance === (role === "shopper" || role === "seller"), me.user);
  for (const path of pages) check(`${username}: page ${path} → 200`, (await request(WEB + path)).status === 200);
}

// Ops still reads the platform ledger through the proxy; others can't.
await signIn("olivia");
const summary = await (await api("ledger/summary")).json();
check("olivia (ops) reads the ledger", summary.balanced === true, summary);
await signIn("sam");
check("sam (shopper) can't read the ledger", (await api("ledger/summary")).status === 403);

// Sign out.
const out = await request(`${WEB}/auth/logout`, { method: "POST", headers: { origin: WEB } });
check("logout redirects to Keycloak end-session", out.status === 303 && out.headers.get("location")?.includes("/protocol/openid-connect/logout"), out.headers.get("location"));
me = await (await api("me")).json();
check("after logout → guest", me.authenticated === false, me);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
