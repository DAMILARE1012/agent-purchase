// M5 "done when": 20 shoppers running at once share the model rate limit fairly.
//
// 20 throwaway shoppers each start one run, while one heavy shopper starts 10 at
// once. The shared limit is lowered for the test so there is real contention.
// Fair means: the account limit is never exceeded, and the heavy shopper can't
// crowd out the others (each gets a fair share; the heavy one's runs just take longer).
//
// Run with the stack up, ideally with more worker slots: docker compose up -d --scale worker=4
// Then: node services/api/tests/load_fairness.mjs
// It creates and then deletes the throwaway Keycloak users (their platform rows stay, as with other smoke tests).
const API = process.env.API_URL ?? "http://localhost:8000";
const KC = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const PASSWORD = "load-test-1234";
const LIGHT = Number(process.env.LIGHT_SHOPPERS ?? 20);
const HEAVY_RUNS = Number(process.env.HEAVY_RUNS ?? 10);
const RPM = Number(process.env.TEST_RPM ?? 120);
const tag = Date.now().toString(36);
let failures = 0;

const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  → " + JSON.stringify(detail).slice(0, 600)}`);
  if (!cond) failures++;
};
// Node's fetch can reuse a keep-alive socket just as the server closes it (ECONNRESET before the
// request is sent). Retrying is safe: the server never saw the request.
const fetchRetry = async (url, init, tries = 3) => {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= tries || err?.cause?.code !== "ECONNRESET") throw err;
      await new Promise((r) => setTimeout(r, 200 * i));
    }
  }
};
const form = async (url, body) => (await fetchRetry(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) })).json();
const tokenFor = async (username, password) =>
  (await form(`${KC}/realms/scan-to-confirm/protocol/openid-connect/token`, { grant_type: "password", client_id: "scan-cli", username, password })).access_token;
const api = async (token, method, path, body) => {
  const res = await fetchRetry(API + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// ---- Throwaway shoppers ----
// Admin tokens live 60 s, so get a fresh one for each call.
const adminToken = async () => (await form(`${KC}/realms/master/protocol/openid-connect/token`, { grant_type: "password", client_id: "admin-cli", username: "admin", password: "admin" })).access_token;
const kc = async (method, path, body) => fetchRetry(`${KC}/admin/realms/scan-to-confirm${path}`, { method, headers: { authorization: `Bearer ${await adminToken()}`, "content-type": "application/json" }, body: body && JSON.stringify(body) });
const names = [...Array(LIGHT + 1)].map((_, i) => `load-${tag}-${String(i).padStart(2, "0")}`);
for (const username of names) {
  await kc("POST", "/users", { username, email: `${username}@example.com`, firstName: "Load", lastName: username.slice(-2), enabled: true, emailVerified: true,
                                credentials: [{ type: "password", value: PASSWORD, temporary: false }] });
}
const tokens = [];
for (const n of names) tokens.push(await tokenFor(n, PASSWORD)); // One at a time: Keycloak drops bursts of logins.
const [heavy, ...light] = tokens;
const ids = new Map();
for (const [i, t] of tokens.entries()) ids.set((await api(t, "GET", "/v1/me")).body.user.id, i === 0 ? "heavy" : "light");
console.log(`Created ${tokens.length} shoppers`);

const ops = await tokenFor("olivia", process.env.DEMO_USER_PASSWORD ?? "demo1234");
await api(ops, "POST", "/v1/ops/llm/limits", { requestsPerMinute: RPM, tokensPerMinute: 10_000_000, interactiveReserve: 0.2 });
console.log(`Shared limit set to ${RPM} requests/minute for the test`);

// Each mandate gets its own budget, so model inputs differ and the gateway's cache can't answer for them:
// every call is a real call that has to get through the rate limiter.
// A random base per execution too: cached answers last 24 hours, across test runs.
let variant = 0;
const base = 20_000 + Math.floor(Math.random() * 40_000);
async function startRun(token) {
  const budget = base + 7 * variant++;
  const request = `A 65W USB-C charger under ₦${budget.toLocaleString("en-NG")} from a verified seller by Friday`;
  const draft = (await api(token, "POST", "/v1/mandates/draft", { request, mode: "present" })).body;
  const m = (await api(token, "POST", "/v1/mandates", { draft, limits: draft.limits, signature: { kind: "test" } })).body;
  return (await api(token, "POST", "/v1/runs", { mandateId: m.id })).body.id;
}

// ---- Everyone at once ----
const started = Date.now();
// Truly simultaneous arrivals, in shuffled order: nobody gets a head start on idle capacity.
const starts = [...[...Array(HEAVY_RUNS)].map(() => ({ who: "heavy", token: heavy })), ...light.map((t) => ({ who: "light", token: t }))]
  .sort(() => Math.random() - 0.5);
const results = await Promise.all(starts.map(async (s) => ({ ...s, runId: await startRun(s.token) })));
const heavyRuns = results.filter((r) => r.who === "heavy").map((r) => r.runId);
const lightRuns = results.filter((r) => r.who === "light").map((r) => r.runId);
const owner = new Map(results.map((r) => [r.runId, r.token]));
console.log(`Started ${heavyRuns.length} heavy + ${lightRuns.length} light runs`);

const done = new Map();
while (done.size < owner.size && Date.now() - started < 15 * 60_000) {
  await new Promise((r) => setTimeout(r, 2000));
  for (const [runId, token] of owner) {
    if (done.has(runId)) continue;
    const run = (await api(token, "GET", `/v1/runs/${runId}`)).body;
    if (!["queued", "running"].includes(run.status)) done.set(runId, { status: run.status, seconds: (Date.now() - started) / 1000 });
  }
  process.stdout.write(`\r  finished ${done.size}/${owner.size} after ${Math.round((Date.now() - started) / 1000)} s   `);
}
console.log();

// ---- Results ----
const secs = (runs) => runs.map((r) => done.get(r)?.seconds ?? Infinity).sort((a, b) => a - b);
const lightT = secs(lightRuns);
const heavyT = secs(heavyRuns);
const median = (xs) => xs[Math.floor(xs.length / 2)];
console.log(`  light runs: median ${median(lightT).toFixed(0)} s, slowest ${lightT.at(-1).toFixed(0)} s`);
console.log(`  heavy runs: median ${median(heavyT).toFixed(0)} s, slowest ${heavyT.at(-1).toFixed(0)} s`);

const usage = (await api(ops, "GET", `/v1/ops/llm/usage?since=${encodeURIComponent(new Date(started).toISOString())}`)).body;
const byRole = { heavy: { calls: 0, waits: [] }, light: { calls: 0, waits: [] } };
for (const u of usage.users) {
  const role = ids.get(u.userId);
  if (role) { byRole[role].calls += u.calls; byRole[role].waits.push(u.avgQueueMs); }
}
const lightAvgWait = byRole.light.waits.reduce((a, b) => a + b, 0) / Math.max(1, byRole.light.waits.length);
const heavyAvgWait = byRole.heavy.waits[0] ?? 0;
console.log(`  model calls: ${byRole.light.calls} light, ${byRole.heavy.calls} heavy; busiest minute: ${usage.busiestMinuteCalls} calls (limit ${RPM})`);
console.log(`  avg wait for capacity per call: light ${Math.round(lightAvgWait)} ms, heavy ${Math.round(heavyAvgWait)} ms`);

check("real contention: model calls weren't served from cache", byRole.light.calls + byRole.heavy.calls >= 2.5 * owner.size, { light: byRole.light.calls, heavy: byRole.heavy.calls });
check("every run finished", done.size === owner.size && [...done.values()].every((d) => !["queued", "running", "failed"].includes(d.status)), [...done.values()].filter((d) => d.status === "failed").length);
check("the shared limit was never exceeded in any 60-second window", usage.busiestMinuteCalls <= RPM, usage.busiestMinuteCalls);
check("light shoppers aren't crowded out: all finish before the heavy shopper's median run", lightT.at(-1) <= median(heavyT), { lightSlowest: lightT.at(-1), heavyMedian: median(heavyT) });
check("the heavy shopper waits longer per call than light shoppers", heavyAvgWait > lightAvgWait, { heavyAvgWait, lightAvgWait });

// ---- Clean up ----
await api(ops, "DELETE", "/v1/ops/llm/limits");
const all = await (await kc("GET", `/users?search=load-&max=500`)).json();
for (const u of all) await kc("DELETE", `/users/${u.id}`);
console.log(`Limits restored; removed ${all.length} throwaway Keycloak users`);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
