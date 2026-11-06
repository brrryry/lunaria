# Lunaria — Private Wealth & Financial Intelligence

Lunaria is a self-hosted personal finance and wealth intelligence web application inspired by Monarch Money and Copilot. It combines live bank and brokerage synchronization via Plaid, automated transaction categorization, zero-based budgeting, recurring subscription tracking, investment analytics, multi-channel financial alerts, and an embedded Gemini AI financial copilot.

---

## ✨ Core Features

- **Customizable Financial Dashboard**: Drag-and-drop modular widget grid (Net Worth, Cash Flow, Spending & Income Breakdown, Recent Transactions, Budget Overview, Investment Allocation, Credit Score) persisted per user.
- **Live Bank & Brokerage Sync (Plaid)**:
  - Connects checking, savings, credit card, loan, and investment accounts via Plaid Link.
  - Real-time webhook listener (`/api/plaid/webhook`) for incremental transaction syncs (`ADDED`, `MODIFIED`, `REMOVED`), holdings updates, and item health alerts (`ITEM_LOGIN_REQUIRED`).
  - Automatic cross-institution transfer and credit card payment detection to prevent double-counting in cash flow and spending metrics.
- **Smart Categorization & Rules Engine**:
  - Custom user categories with emoji icons and color tokens.
  - Merchant-level category rules that retroactively recategorize historical transactions and automatically classify future syncs.
  - Unreviewed transactions queue for one-click review.
- **Zero-Based & Category Budgeting**:
  - Monthly income vs. expense planning with per-category targets, progress bars, and inline editing.
  - Automatic budget migration when custom categories are renamed or deleted.
- **Recurring Transactions & Subscriptions**:
  - Detects recurring inflows (paychecks, dividends) and outflows (subscriptions, utilities, rent) via Plaid recurring streams.
  - Interactive monthly calendar view and stream dismissal/restoration.
- **Investment Portfolio & Market Data**:
  - Live holdings, cost basis, unrealized gain/loss, and asset allocation breakdown.
  - Historical portfolio performance and live ticker quotes powered by Polygon.io.
- **AI Financial Copilot (`⌘K`)**:
  - Slide-over conversational assistant powered by Google Gemini (`gemini-2.5-flash`) with function-calling tools over your live accounts, transactions, budgets, recurring bills, and net worth.
  - Multi-conversation history and headless API endpoints (`/api/ai/agent/*`) for external autonomous agents (e.g., OpenClaw).
- **Multi-Channel Alerts & Notifications**:
  - Real-time evaluation for budget thresholds, large transactions, upcoming recurring bills, and disconnected bank items.
  - Delivery via in-app notification center, **Resend** transactional emails, and **VAPID Web Push** notifications.
- **Security & Privacy First**:
  - Plaid access tokens encrypted at rest using **AES-256-GCM** (`ENCRYPTION_KEY`) with random IVs and auth tags.
  - Google OAuth 2.0 authentication with `HttpOnly` JWT cookies and optional email allowlisting (`AUTH_WHITELIST_EMAILS`).

---

## 🏗️ Monorepo Architecture

```text
lunaria/
├── website/                  # Next.js 14 App Router web frontend (Tailwind CSS, Recharts, Lucide)
├── backend/                  # NestJS modular REST API & webhook server
│   └── src/
│       ├── accounts/         # Account balances, credit limits, and manual sync
│       ├── ai/               # Gemini AI Copilot & headless agent API
│       ├── auth/             # Google OAuth 2.0, JWT guards, and session cookies
│       ├── budget/           # Monthly category budgets & spending aggregation
│       ├── categories/       # Custom categories & merchant categorization rules
│       ├── crypto/           # AES-256-GCM token encryption service
│       ├── dashboard/        # Net worth, cash flow, and widget layout persistence
│       ├── investments/      # Holdings, asset allocation, and Polygon.io market data
│       ├── notifications/    # Alert evaluation, Resend email, and VAPID Web Push
│       ├── plaid/            # Plaid Link tokens, transaction/holding sync, recurring streams, webhooks
│       └── transactions/     # Transaction filtering, search, and review workflow
├── packages/
│   ├── db/                   # Drizzle ORM PostgreSQL schema, client, and seed scripts
│   └── types/                # Shared TypeScript interfaces & DTOs across frontend and backend
├── openclaw-skill/           # OpenClaw autonomous agent skill definition
├── scripts/
│   └── deploy-nas.sh         # Automated SSH + Docker Compose deployment script for NAS
├── tests/                    # Vitest unit & integration test suites
├── compose.yaml              # Production Docker Compose stack
├── docker-compose.dev.yml    # Local development infrastructure (PostgreSQL + TimescaleDB, Redis)
├── pnpm-workspace.yaml       # pnpm workspace configuration
└── turbo.json                # Turborepo task pipeline
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v20+ (v22 LTS recommended)
- **pnpm**: v10+ (`corepack enable && corepack prepare pnpm@10.12.1 --activate`)
- **Docker & Docker Compose**: For local PostgreSQL/TimescaleDB and Redis (or bring your own PostgreSQL connection URL)

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
Copy the template environment file and populate your API keys:
```bash
cp .env.example .env
```

### 4. Start Local Infrastructure & Push Schema
Start local PostgreSQL and Redis containers (if using local Docker infrastructure):
```bash
pnpm infra:up
```
Push the Drizzle schema to PostgreSQL:
```bash
pnpm db:push
```
*(Optional)* Seed demo financial data:
```bash
pnpm db:seed
```

### 5. Start Development Servers
Run both the Next.js web app and NestJS backend concurrently via Turborepo:
```bash
pnpm dev
```
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:3001/api](http://localhost:3001/api)

---

## 🔐 Environment Variables

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/lunaria` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | NestJS backend listening port | `3001` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated | `http://localhost:3000` |
| `FRONTEND_URL` | Base URL of the web application for OAuth redirects | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Backend API base URL consumed by the browser | `http://localhost:3001/api` |
| `ENCRYPTION_KEY` | 64-character hex string (32 bytes) for AES-256-GCM encryption | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | `*.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | — |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback endpoint | `http://localhost:3001/api/auth/google/callback` |
| `JWT_SECRET` | Secret key used to sign session JWTs | `openssl rand -base64 32` |
| `AUTH_WHITELIST_EMAILS` | Optional comma-separated list of allowed login emails | `you@example.com` |
| `PLAID_CLIENT_ID` | Plaid API Client ID | — |
| `PLAID_SECRET` | Plaid API Secret | — |
| `PLAID_ENV` | Plaid environment (`sandbox`, `development`, or `production`) | `sandbox` |
| `PLAID_WEBHOOK_URL` | Publicly reachable webhook URL for Plaid events | `https://api.yourdomain.com/api/plaid/webhook` |
| `POLYGON_API_KEY` | Polygon.io API key for stock quotes & historical charts | — |
| `GEMINI_API_KEY` | Google Gemini API key for the AI Copilot | — |
| `GEMINI_MODEL` | Gemini model identifier | `gemini-2.5-flash` |
| `RESEND_API_KEY` | Resend API key for email notifications | `re_...` |
| `RESEND_FROM_EMAIL` | Sender address for email alerts | `onboarding@resend.dev` |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key (`npx web-push generate-vapid-keys`) | — |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key | — |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key exposed to the browser | — |
| `LUNARIA_AGENT_API_KEY` | Optional static bearer key for `/api/ai/agent/*` endpoints | — |
| `LUNARIA_AGENT_USER_EMAIL` | Target user email for headless agent queries | `you@example.com` |

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Run `website` and `backend` in watch mode via Turborepo |
| `pnpm build` | Build all packages (`@lunaria/types`, `@lunaria/db`, `@lunaria/backend`, `@lunaria/website`) |
| `pnpm typecheck` | Run TypeScript typechecking (`tsc --noEmit`) across all packages |
| `pnpm test` | Run the Vitest test suite once |
| `pnpm test:watch` | Run Vitest in interactive watch mode |
| `pnpm db:push` | Push Drizzle ORM schema changes directly to PostgreSQL |
| `pnpm db:seed` | Seed sample accounts, transactions, and holdings |
| `pnpm db:clear` | Clear seeded data from the database |
| `pnpm infra:up` | Start local PostgreSQL & Redis via `docker-compose.dev.yml` |
| `pnpm infra:down` | Stop local PostgreSQL & Redis containers |
| `pnpm deploy:nas` | Package and deploy the stack to your NAS via SSH & Docker Compose |

---

## 🚢 Deployment

### Docker Compose
Build and start the production containers (`lunaria-backend` on port `3001` and `lunaria-website` on port `3003 -> 3000`):
```bash
docker compose up -d --build --remove-orphans
```

### NAS Deployment (`scripts/deploy-nas.sh`)
Deploy directly to a remote NAS running Docker Compose / Dockge over SSH:
```bash
# Deploy code changes while preserving the remote .env file on the NAS:
pnpm deploy:nas

# Deploy and overwrite the remote .env with your local .env:
bash ./scripts/deploy-nas.sh --with-env
```
Configure `NAS_USER`, `NAS_HOST`, `NAS_SSH_KEY`, and `STACK_DIR` via environment variables if deploying to a custom host.
