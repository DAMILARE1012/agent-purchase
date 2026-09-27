# Scan-to-Confirm: web app

The web UI and backend-for-frontend (BFF) for Scan-to-Confirm. Run the whole stack with Docker from the repository root; see [`../README.md`](../README.md).

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
    (app)/                  Pages with the app header
      wallet/ activity/ send/ transactions/[tx]/ r/ risk/ ledger/ signin-error/
    auth/login|callback|logout/   OIDC route handlers
    api/v1/[...path]/       BFF proxy to the FastAPI service
    .well-known/receipt-keys.json/   Public receipt-signing keys (proxied)
  server/                   Server-only code: config, OIDC client, Redis sessions, CSRF helper
  features/                 One folder per feature
    <feature>/
      api.ts                RTK Query endpoints (api.injectEndpoints)
      components/           The feature's React components
      hooks/  lib/          Feature-only hooks and helpers
      *Slice.ts             Redux slice, if the feature has UI state
      index.ts              The feature's public exports; import from here
  components/ui/            Shared UI (Button, Card, Dialog, Field, StatTile, SegmentedControl, Avatar, Icon…)
  components/layout/        App shell: role-based sidebar, top bar, mobile menu (navigation.ts holds the nav per role)
  store/                    Store setup, base API, typed hooks, provider
  lib/                      Pure helpers (money, dates, errors, idempotency keys)
  types/api.ts              API contract (mirrors services/api/app/schemas.py)
scripts/smoke-login.mjs     End-to-end sign-in test
```

### Features

| Feature | What it does |
|---|---|
| `session` | Current user, Sign in / Create account / Sign out, `RequireSignIn` page guard |
| `wallet` | Member dashboard (balance, money in/out, cash-flow chart, needs-attention list, quick pay) and the Activity page |
| `transfers` | Send money, step-up, payment detail and timeline, send-back warning, sandbox rail tools |
| `receipts` | Signed QR receipt, share, download image |
| `verify` | Check a receipt by link, upload or camera; verdict, warnings and checks; sandbox scenarios |
| `refunds` | Refund linked to the original payment |
| `disputes` | Report a problem |
| `risk` | Analyst console: KPIs, filterable case queue with risk meters, case detail with evidence, AI summary and decisions |
| `ledger` | Platform finance: trial balance, accounts, journal, a payment's postings |
| `marketing` | Landing page: hero, how it works, fraud protection, audiences, security, sandbox invite, FAQ |
| `notifications` | Toasts |

### Dashboards by role

| Role | Home | What's on it |
|---|---|---|
| Member / business | `/wallet` | Balance, money in and out for the chosen period, daily cash-flow chart, payments to confirm or review, recent activity, quick pay |
| Risk analyst | `/risk` | Open cases, value on hold, suspicious receipts, resolved count; case queue with type, amount, risk and age |
| Platform finance | `/ledger` | Trial balance, liabilities and suspense, every account's balance, the journal |

The cash-flow chart's colours (`--chart-in`, `--chart-out` in `globals.css`) were checked with a colour-vision-deficiency validator against both themes' surfaces. Money in and money out are also separated by position (above and below the baseline), so the chart doesn't rely on colour alone.

### State management

- **Server data** is handled by RTK Query. Each feature adds its endpoints to the shared `api`. Cache tags (`Wallet`, `Transfer`, `Case`, `Ledger`…) refresh affected views after a mutation.
- **UI state** lives in slices: `notifications` (toasts) and `verify` (last receipt submitted, input tab).
- The verify page shares one scan result across components with RTK Query's `fixedCacheKey`.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build (also type-checks)
npm run lint    # ESLint
```
