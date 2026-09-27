# Mandate Gate: web app

The web UI and backend-for-frontend (BFF) for Mandate Gate. Run the whole stack with Docker from the repository root; see [`../README.md`](../README.md).

Stack: **Next.js 16** (App Router), **Redux Toolkit** (RTK Query for the API, slices for UI state), **Tailwind CSS v4**, TypeScript.

## Developing the UI outside Docker

Start everything except `web`, then run Next.js locally:

```bash
docker compose up -d postgres redis keycloak api   # from the repo root
cd web
npm install
npm run dev                                         # http://localhost:3000
```

The defaults in `src/server/config.ts` point at the Docker services on `localhost` (Keycloak 8080, API 8000, Redis 6379). Redis isn't published to the host in `docker-compose.yml`; add `ports: ["6379:6379"]` to the `redis` service to use it from `npm run dev`.

## How sign-in works

1. **Sign in** goes to `/auth/login`, which creates a PKCE verifier, state and nonce in Redis and redirects to Keycloak.
2. Keycloak redirects back to `/auth/callback`. The server exchanges the code for tokens (confidential client), checks the ID token's issuer, audience, nonce and expiry, and stores the tokens in a Redis session.
3. The browser receives only `stc_sid`, a random, httpOnly, SameSite=Lax cookie.
4. The UI calls `/api/v1/*`. The catch-all route `src/app/api/v1/[...path]/route.ts` looks up the session, refreshes the access token if it is about to expire, and forwards the request to FastAPI with `Authorization: Bearer …`. Mutating requests with a foreign `Origin` are rejected (CSRF).
5. **Sign out** posts to `/auth/logout`, which deletes the session and ends the Keycloak session.

## Project layout

```text
src/
  app/                      Routes: each page renders one feature component
    (marketing)/            The public landing page at /
    (app)/                  Pages with the app shell
      home/                 Sign-in lands here and redirects to the role's workspace
      shop/ seller/ support/ ops/ admin/   One workspace per role; each layout guards its role
      verify/               Public receipt verification
      signin-error/
    auth/login|callback|logout/   OIDC route handlers
    api/v1/[...path]/       BFF proxy to the FastAPI service
    .well-known/receipt-keys.json/   Public receipt-signing keys (proxied)
  server/                   Server-only code: config, OIDC client, Redis sessions, CSRF helper
  features/                 One folder per feature
    <feature>/
      api.ts                RTK Query endpoints (api.injectEndpoints)
      components/           The feature's React components
      hooks/  lib/          Feature-only hooks and helpers
      index.ts              The feature's public exports; import from here
  mocks/                    Mock API for endpoints the backend doesn't have yet
  components/ui/            Shared UI (Button, Card, Dialog, Field, StatTile, Icon…)
  components/layout/        App shell; navigation.ts holds each role's navigation and home
  store/                    Store setup, base API (real or mock), typed hooks, provider
  lib/                      Pure helpers (money in NGN, dates, errors, idempotency keys)
  types/api.ts              Contract for existing API endpoints (mirrors services/api/app/schemas.py)
  types/domain.ts           Mandate Gate domain: mandates, runs, carts, gate decisions, purchases, sellers, ops
scripts/smoke-login.mjs     End-to-end sign-in test for every role (non-destructive)
```

### Features

| Feature | What it does |
|---|---|
| `session` | Current user, sign in / out, `RequireSignIn` guard, role home redirect |
| `mandates` | Draft (Qwen), sign, list and cancel mandates |
| `runs` | AI shopping runs: start, follow live, approve or decline the cart |
| `purchases` | Purchases and signed receipts; public receipt verification |
| `sellers` | Seller directory, the seller's own catalog, orders and accounts; admin tiers |
| `support` | Blocked carts and disputes |
| `agentops` | Ops overview, run traces, agent versions, evaluations, test-marketplace reports |
| `ledger` | Platform ledger: trial balance, accounts, journal |
| `banking` | Banks, account-number input and name enquiry (for sellers' bank accounts) |
| `receipts` | QR code rendering |
| `marketing` | Landing page (rewritten in M2) |
| `notifications` | Toasts |
| `previews` | M1 placeholders' live data reads; removed as M2 and M3 build the real screens |

### Mock API

`src/store/api.ts` sends each request to `src/mocks/handlers.ts` first when `NEXT_PUBLIC_API_MOCKS` isn't `false`. If a mock route matches, the mock answers (with a short delay). Otherwise the request goes to the real API through the BFF.

- `mocks/data.ts`: sandbox sellers (some dishonest), catalogs, mandates, runs, purchases, agent versions, evaluations and test-marketplace reports.
- `mocks/gate.ts`: a TypeScript mirror of the gate rules, so mocked carts get realistic allow or deny decisions. It's UI data only, never a security control; the real gate is server-side (M7).
- `mocks/compile.ts` stands in for Qwen's sentence-to-mandate drafting. `mocks/simulate.ts` stands in for the agent runtime: new runs reveal their steps over a few seconds.

When a backend endpoint ships, delete its route from `handlers.ts`.

### State management

- **Server data** is handled by RTK Query. Each feature adds its endpoints to the shared `api`. Cache tags (`Mandate`, `Run`, `Purchase`, `Seller`, `Support`, `Ops`, `Ledger`…) refresh affected views after a mutation.
- **UI state** lives in slices: `notifications` (toasts).

## Scripts

```bash
npm run dev     # development server
npm run build   # production build (also type-checks)
npm run lint    # ESLint
```
