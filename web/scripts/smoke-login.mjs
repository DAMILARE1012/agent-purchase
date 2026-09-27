// Scripted browser sign-in through the real OIDC flow:
// web /auth/login → Keycloak login form → /auth/callback → session cookie → BFF proxy → API.
// Run with the stack up: node web/scripts/smoke-login.mjs
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
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

async function signIn(username, returnTo = "/wallet") {
  const start = await request(`${WEB}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  const authUrl = start.headers.get("location");
  const form = await request(authUrl);
  const html = await form.text();
  const action = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!action) throw new Error("Keycloak login form not found");
  const submit = await request(action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password: "demo1234", credentialId: "" }),
  });
  const callback = submit.headers.get("location");
  const done = await request(callback);
  return { start, authUrl, submit, callback, done };
}

const api = (path, init) => request(`${WEB}/api/v1/${path}`, init);

// Signed out.
let me = await (await api("me")).json();
check("signed out → guest", me.authenticated === false, me);

// Sign in as Rita through Keycloak.
const flow = await signIn("rita");
check("login redirects to Keycloak with PKCE", flow.authUrl.startsWith("http://localhost:8080/") && flow.authUrl.includes("code_challenge_method=S256"), flow.authUrl);
check("Keycloak redirects back to /auth/callback", flow.callback?.startsWith(`${WEB}/auth/callback?`), flow.callback);
check("callback lands on returnTo", flow.done.headers.get("location") === `${WEB}/wallet`, flow.done.headers.get("location"));
const webJar = jars.get(new URL(WEB).host);
check("session cookie set (httpOnly, opaque)", webJar.has("stc_sid") && !webJar.get("stc_sid").includes("."), [...webJar.keys()]);

me = await (await api("me")).json();
check("signed in as Rita via the proxy", me.authenticated && me.user.handle === "@rita", me);
const wallet = await (await api("wallet")).json();
check("wallet loads through the proxy", typeof wallet.balanceMinor === "number", wallet);

// Mutations: CSRF check on Origin.
const people = await (await api("users")).json();
const sam = people.find((p) => p.handle === "@sam");
const body = JSON.stringify({ toUserId: sam.userId, amountMinor: 100, note: "Proxy test" });
const crossSite = await api("transfers", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "idempotency-key": crypto.randomUUID() }, body });
check("cross-site POST blocked", crossSite.status === 403, crossSite.status);
const sameSite = await api("transfers", { method: "POST", headers: { "content-type": "application/json", origin: WEB, "idempotency-key": crypto.randomUUID() }, body });
const created = await sameSite.json();
check("same-site POST creates payment", sameSite.status === 200 && created.transfer?.status === "settled", created);

// Pages render (server side) with the session.
for (const path of ["/wallet", "/send", "/r", `/transactions/${created.transfer.tx}`]) {
  check(`page ${path} → 200`, (await request(WEB + path)).status === 200);
}
check("open redirect blocked", (await request(`${WEB}/auth/login?returnTo=//evil.example`)).status === 307);

// Sign out.
const out = await request(`${WEB}/auth/logout`, { method: "POST", headers: { origin: WEB } });
check("logout redirects to Keycloak end-session", out.status === 303 && out.headers.get("location")?.includes("/protocol/openid-connect/logout"), out.headers.get("location"));
me = await (await api("me")).json();
check("after logout → guest", me.authenticated === false, me);

// Ops sees the ledger through the web app.
jars.clear();
await signIn("olivia", "/ledger");
const summary = await (await api("ledger/summary")).json();
check("olivia (ops) reads the ledger via the proxy", summary.balanced === true, summary);

// Leave the demo data as we found it.
const reset = await request(`${WEB}/api/v1/sandbox/reset`, { method: "POST", headers: { origin: WEB } });
check("demo data reset (as ops)", reset.status === 200, reset.status);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
