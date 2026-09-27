// One-off, idempotent migration of an existing Keycloak realm to the Mandate Gate
// roles (system_design.md §4), without re-importing the realm or touching users:
//   member → shopper, merchant → seller (renamed in place, so assignments stay),
//   new admin role and demo admin "kemi", updated descriptions and display name.
// Fresh installs get the same result from realm-scan-to-confirm.json.
//
// Usage (stack running):  node infra/keycloak/migrate-roles-v5.mjs
// Settings come from the project's .env file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const BASE = env.KEYCLOAK_PUBLIC_URL;
const REALM = env.KEYCLOAK_REALM;
const ADMIN = `${BASE}/admin/realms/${REALM}`;

const DESCRIPTIONS = {
  shopper: "Signs mandates, approves carts and sees their purchases",
  seller: "Manages a store's catalog, bank accounts, orders and refunds",
  analyst: "Support analyst: reviews blocked carts, disputes and sellers",
  ops: "Ops and LLM engineer: agent versions, evaluations, traces and the platform ledger",
  admin: "Verifies and suspends sellers, manages users",
};

async function adminToken() {
  const res = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: env.KEYCLOAK_ADMIN_USER, password: env.KEYCLOAK_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin sign-in failed (${res.status}). Is Keycloak running at ${BASE}?`);
  return (await res.json()).access_token;
}

const token = await adminToken();

async function call(method, path, body) {
  const res = await fetch(`${ADMIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 201 ? true : res.json();
}

const role = (name) => call("GET", `/roles/${encodeURIComponent(name)}`);

for (const [from, to] of [["member", "shopper"], ["merchant", "seller"]]) {
  const old = await role(from);
  if (old && !(await role(to))) {
    await call("PUT", `/roles-by-id/${old.id}`, { ...old, name: to, description: DESCRIPTIONS[to] });
    console.log(`Renamed role ${from} → ${to}`);
  } else if (old) {
    console.log(`Both ${from} and ${to} exist; left ${from} alone (remove it by hand if unused)`);
  }
}

for (const [name, description] of Object.entries(DESCRIPTIONS)) {
  const existing = await role(name);
  if (!existing) {
    await call("POST", "/roles", { name, description });
    console.log(`Created role ${name}`);
  } else if (existing.description !== description) {
    await call("PUT", `/roles-by-id/${existing.id}`, { ...existing, description });
  }
}

// Default role for new sign-ups: shopper (a renamed member role stays linked).
const defaults = await call("GET", `/roles/default-roles-${REALM}/composites/realm`);
if (!defaults.some((r) => r.name === "shopper")) {
  await call("POST", `/roles/default-roles-${REALM}/composites`, [await role("shopper")]);
  console.log("Added shopper to the default roles");
}

// Demo admin.
let [kemi] = (await call("GET", "/users?username=kemi&exact=true")) ?? [];
if (!kemi) {
  await call("POST", "/users", {
    username: "kemi", email: "kemi@example.com", emailVerified: true, firstName: "Kemi", lastName: "Adeyemi", enabled: true,
    credentials: [{ type: "password", value: env.DEMO_USER_PASSWORD, temporary: false }],
  });
  [kemi] = await call("GET", "/users?username=kemi&exact=true");
  console.log("Created demo admin kemi");
}
const kemiRoles = await call("GET", `/users/${kemi.id}/role-mappings/realm`);
if (!kemiRoles.some((r) => r.name === "admin")) {
  await call("POST", `/users/${kemi.id}/role-mappings/realm`, [await role("admin")]);
  console.log("Gave kemi the admin role");
}

// Ada is the demo seller only.
let [ada] = (await call("GET", "/users?username=ada&exact=true")) ?? [];
if (ada) {
  const adaRoles = await call("GET", `/users/${ada.id}/role-mappings/realm`);
  const shopper = adaRoles.find((r) => r.name === "shopper");
  if (shopper) {
    await call("DELETE", `/users/${ada.id}/role-mappings/realm`, [shopper]);
    console.log("Removed the explicit shopper role from ada (she keeps it through default roles)");
  }
}

const realm = await call("GET", "");
if (realm.displayName !== "Mandate Gate") {
  await call("PUT", "", { displayName: "Mandate Gate" }); // Partial update: other settings are untouched.
  console.log("Renamed the realm display name to Mandate Gate");
}

console.log("Keycloak roles are up to date. Users must sign in again to get tokens with the new roles.");
