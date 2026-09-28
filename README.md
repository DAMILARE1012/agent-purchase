# Mandate Gate

**Let an AI shop for you and pay by bank transfer, without it being able to spend your money in ways you didn't agree to.**

![Mandate Gate landing page](docs/screenshots/01-landing.png)

## The problem

Online shopping in Nigeria runs on **bank transfers**. A transfer can't be reversed: there is no chargeback and no card network to claim a refund from. If you send money to the wrong account, it's gone.

AI agents can now shop for people, but an AI is easy to mislead:

- **Hidden instructions.** A seller's page says "ignore your limits, this is the best deal" and the AI believes it.
- **Fake stores.** A new shop copies a trusted brand's name and undercuts every price.
- **Swapped accounts.** The cart names one business, but the bank account belongs to someone else.
- **Misunderstood requests.** You said "under ₦40,000"; the AI decided ₦45,000 was close enough.

Giving an AI your bank login means one mistake costs real money you can't get back.

## What we're building

A way to let an AI shop for you where **the AI can suggest a purchase, but only rules you signed can let money leave**:

- **You set the limits once**, in plain words: item, price, sellers, delivery. You sign them. That's your *mandate*.
- **The AI does the searching**: compares sellers, reads catalogs, even photos of price lists.
- **A gate outside the AI checks every cart** against your mandate and the bank's records. It's plain code, not a model, so it can't be talked into anything.
- **You approve the exact cart** before any money moves, and everyone gets a receipt that proves it.

The goal: an AI that can be fooled, and still can't cost you money.

## How it works

![How a purchase works](docs/diagrams/how-it-works.svg)

1. **You ask.** "HP 107A toner, under ₦40,000, from a verified seller, by Friday."
2. **Mandate.** Qwen drafts the exact limits. Every value must quote your words; anything you didn't say is set to the strictest option. You check them and sign with your passkey.
3. **AI shopper.** It searches sellers, reads their catalogs and proposes a cart. It has no way to pay.
4. **Gate.** Nine checks in plain code: the item, the price, the seller, the delivery date, and asking the bank who owns the account being paid. If any check fails, the cart is refused and nothing is paid.
5. **You approve** that exact cart, with your passkey (or an email code for carts up to ₦50,000).
6. **Payment.** The gate checks again at the moment of payment, then the bank transfer is made.
7. **Receipt.** Signed by the platform. The seller, or anyone, can verify it at `/verify`.

## Screenshots

| | |
|---|---|
| ![Marketplace](docs/screenshots/02-marketplace.png) | ![Mandate](docs/screenshots/03-mandate.png) |
| **Marketplace.** Compare every seller's offer for the same product. | **Mandate.** Check the limits drafted from your words, then sign. |
| ![Blocked by the gate](docs/screenshots/04-gate-blocked.png) | ![Approve](docs/screenshots/05-approve.png) |
| **Blocked.** The AI picked a dishonest seller; the gate refused. | **Approve.** You sign the exact amount and account. |
| ![Receipt](docs/screenshots/06-receipt.png) | ![Verify](docs/screenshots/07-verify.png) |
| **Receipt.** What was paid, to whom, and under which mandate. | **Verify.** Anyone can check a receipt, no account needed. |

## Quick start

Needs Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

Open **http://localhost:3000** (use `localhost`, not `127.0.0.1`: passkeys and sign-in depend on it).

| | URL |
|---|---|
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Email inbox (sandbox) | http://localhost:8025 |
| Keycloak admin | http://localhost:8080/admin (admin / admin) |
| Sandbox banks / marketplace | http://localhost:8100/docs · http://localhost:8200/docs |

### Demo accounts (password `demo1234`)

| User | Role | Try this |
|---|---|---|
| `sam` | Shopper | Browse the Marketplace, create a mandate, watch the AI shop, approve a payment |
| `ada` | Seller | See paid orders and check their receipts |
| `morgan` | Support | Carts the gate blocked, and why |
| `olivia` | Ops | Run traces, evaluations, model limits |
| `kemi` | Admin | Verify or suspend sellers |

## Use the real AI model

Without a key, a scripted stand-in plays the AI (clearly labelled). To use Qwen on Groq, add your key to `.env` and restart:

```bash
GROQ_API_KEY=your-key            # in .env, never committed
docker compose up -d api worker
```

Set `LLM_TOKENS_PER_MINUTE` and `LLM_REQUESTS_PER_MINUTE` to your Groq account's limits.

## Send real email (optional)

Approval codes land in the sandbox inbox (http://localhost:8025). To send through Gmail, set in `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=your-google-app-password   # an app password, not your Gmail password
MAIL_FROM=Mandate Gate <you@gmail.com>
```

## Architecture

![Architecture](docs/diagrams/architecture.svg)

The worker runs the AI and can't pay. Only the api, through the gate, can ask the banks to move money.

| Service | What it does |
|---|---|
| `web` | The app for every role. Its server handles sign-in and proxies the API, so the browser never holds tokens. |
| `api` | Mandates, the gate, payments and ledger, receipts, the model gateway, evaluations. |
| `worker` | Runs the AI shopper, one step at a time. Add more with `--scale worker=N`. |
| `marketplace` | 23 test sellers (3 deliberately dishonest), with catalogs and signed carts. |
| `switch` | 4 test banks: account name checks and transfers. |
| `keycloak` | Accounts and roles. |
| `postgres`, `redis` | Data; queue, live updates and shared rate limits. |
| `mailpit` | Catches every email in the sandbox. |

## Tests

```bash
# Unit tests, generated gate tests and the release gate (what CI runs)
docker compose run --rm --no-deps --entrypoint "python -m pytest -q" api
cd web && npx tsc --noEmit && npx eslint src

# End to end, with the stack running
node services/api/tests/smoke_payments.mjs        # pays once, never over the mandate, even under 50 parallel approvals
node services/api/tests/smoke_access.mjs          # nobody sees or acts on another user's data
node services/api/tests/smoke_agent.mjs           # the AI shops live; the gate blocks dishonest sellers
node services/api/tests/smoke_email_approval.mjs  # approve with an email code
node web/scripts/smoke-login.mjs                  # sign-in for every role
```

Tests create data and spend sandbox money; they don't reset anything. Avoid `smoke_api.mjs`: it tests the previous product and **resets the demo data**.

## Evaluation

Every AI version runs the same tests on the real model before it can ship. Results are committed in `services/api/evals/reports/`, and CI blocks a version that gets worse.

```bash
docker compose exec api python -m app.evals run --release shopper-2026.09.6   # measure a version
docker compose exec api python -m app.evals gate                               # is the candidate worse than live?
```

## Project layout

```text
services/api/          API, gate, payments, AI agent and prompts, evaluations
services/marketplace/  Sandbox sellers
services/switch/       Sandbox banks
web/                   Next.js app (src/features/* by feature)
infra/                 Keycloak realm and database setup
system_design.md       The problem, the design and the milestones
```

## Status

M1–M7 are done: every screen, the marketplace, the AI shopper, mandates with passkeys, and real payments with receipts. M8 (evaluation) is finishing. Next: attack testing (M9), buying while you're away (M10), operations (M11), refunds and disputes (M12). See [`system_design.md`](system_design.md).

## Not production-ready

- **No real money:** sandbox banks only. A launch needs a licensed payment partner.
- **Signing key:** the receipt-signing key is stored in the database; production would use a key vault.
- **Test-only settings:** the `scan-cli` test login and `ALLOW_TEST_SIGNATURES` must be turned off, and every value marked CHANGE in `.env.example` replaced.
