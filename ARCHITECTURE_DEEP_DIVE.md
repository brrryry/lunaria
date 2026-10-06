# Lunaria Architecture & Engineering Deep Dive

An exhaustive, per-service and per-function breakdown of the **Lunaria** financial platform covering:
1. **Security & Cryptography** (AES-256-GCM token encryption, OAuth 2.0 PKCE flows, JWT session tokens, whitelist gating, webhook integrity).
2. **Efficiency, Caching & Data Layer** (TimescaleDB time-series hypertables, Plaid cursor delta syncs, batch upserts, cascade budget propagation, and query downsampling).
3. **External Data Sources & Pipelines** (Plaid API integration, Google Identity, Polygon.io / Market benchmarks, Resend email dispatch, and Web Push RFC 8291/8292 VAPID).

---

## 1. System Architecture Overview

```
                                  ┌────────────────────────┐
                                  │   Next.js Web (3000)   │
                                  │   Expo Mobile App      │
                                  └───────────┬────────────┘
                                              │ REST / JSON (JWT Bearer)
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               NestJS Backend Core (3001)                               │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │     AuthService       │  │     PlaidService      │  │       StocksService        │  │
│  │ (OAuth / Whitelist)   │  │  (Sync / Cursor / GCM)│  │ (Snapshots / Benchmarks)   │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │     BudgetService     │  │  TransactionsService  │  │   NotificationsService     │  │
│  │ (Cascades / Balances) │  │  (Rules / Merchants)  │  │  (Resend / VAPID Push)     │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Drizzle ORM (Connection Pool)
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │        PostgreSQL + TimescaleDB         │
                       │  - accounts, transactions, categories   │
                       │  - portfolio_snapshots (hypertable)     │
                       │  - price_snapshots (hypertable)         │
                       │  - plaid_items, notification_prefs      │
                       └─────────────────────────────────────────┘
```

---

## 2. Security Architecture & Deep Dive

### 2.1 Cryptographic Storage: AES-256-GCM
**Source**: [`backend/src/common/encryption.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/common/encryption.service.ts)

All sensitive bank credentials (specifically Plaid `access_token`s) are encrypted before writing to `plaid_items.access_token_encrypted`. Lunaria utilizes **AES-256-GCM** (Galois/Counter Mode), which provides both confidentiality and authenticated integrity.

#### Function Breakdown:
* **`constructor(configService)`**:
  * Reads `ENCRYPTION_KEY` from the environment.
  * Normalizes and derives a deterministic 256-bit (32-byte) key using `createHash('sha256').update(rawKey).digest()`. This guarantees that regardless of whether the key is entered as a raw secret passphrase or a 64-character hex string, the cipher receives an exact 32-byte key.
* **`encrypt(plaintext: string): string`**:
  * Generates a cryptographically secure 12-byte (96-bit) Initialization Vector (IV) via `randomBytes(12)`.
  * Instantiates `createCipheriv('aes-256-gcm', this.key, iv)`.
  * Concatenates cipher updates and final output.
  * Extracts the 16-byte (128-bit) authentication tag via `cipher.getAuthTag()`.
  * Formats and returns the string: `${ivHex}:${tagHex}:${encryptedHex}`.
  * *Security Property*: Even identical Plaid tokens produce entirely different ciphertext strings on each write due to the random 96-bit IV, preventing chosen-ciphertext analysis.
* **`decrypt(ciphertext: string): string`**:
  * Splits the string by `:` into exactly 3 components: `ivHex`, `tagHex`, and `encryptedHex`.
  * Instantiates `createDecipheriv('aes-256-gcm', this.key, iv)` and calls `decipher.setAuthTag(tag)`.
  * Decrypts and verifies the payload. If the ciphertext or tag has been tampered with or modified in the database, `decipher.final()` throws an authentication error, preventing bit-flipping attacks.

---

### 2.2 Authentication, Whitelisting & Session Management
**Source**: [`backend/src/auth/auth.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/auth/auth.service.ts) & [`backend/src/auth/auth.controller.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/auth/auth.controller.ts)

#### Function Breakdown:
* **`exchangeGoogleCode(code: string)`**:
  * Invoked by `GET /api/auth/google/callback`.
  * Posts the temporary authorization code to Google's OAuth 2.0 token endpoint: `https://oauth2.googleapis.com/token`.
  * Retrieves `access_token` and `id_token` without exposing client secrets to the browser.
  * Fetches user profile from `https://www.googleapis.com/oauth2/v2/userinfo`.
* **`upsertGoogleUser(profile: GoogleProfile)`**:
  * **Email Whitelist Verification**: Reads `AUTH_WHITELIST_EMAILS`. If configured, it performs a case-insensitive check:
    ```typescript
    const isWhitelisted = whitelist.some(
      (w) => w.toLowerCase() === normalizedEmail
    );
    if (!isWhitelisted) {
      throw new ForbiddenException('Email not authorized during invite-only preview');
    }
    ```
    This prevents arbitrary public Google accounts from querying or seeding accounts during closed testing.
  * Executes an atomic database upsert on `users`:
    * Searches by `google_id` or `email`.
    * Creates the user record if new, or updates `fullName`, `avatarUrl`, and `updatedAt`.
  * Generates an HMAC-SHA256 JWT containing `{ sub: user.id, email: user.email }` signed with `JWT_SECRET` with a 30-day expiration (`expiresIn: '30d'`).
  * Seeds default categories (e.g. Income, Housing, Food & Dining, Transportation, Utilities) if the account was newly provisioned.
* **`resolveUserId(providedUserId?: string, authHeader?: string): Promise<string>`**:
  * Decodes and verifies the Bearer JWT from the `Authorization: Bearer <token>` header.
  * Ensures that requests attempting to operate on `userId` match the authenticated JWT subject, preventing horizontal privilege escalation where User A queries User B's financial data.

---

### 2.3 Network, CORS & Endpoint Defense
**Source**: [`backend/src/main.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/main.ts)

* **CORS Origin Filtering**:
  ```typescript
  const configuredOrigins = (configService.get<string>('CORS_ORIGIN') || '')
    .split(',')
    .map((o) => o.trim());
  ```
  Permits credentials (`credentials: true`) while restricting allowed origins strictly to the specified frontend URLs (plus `localhost` during development).
* **Body Size Limiting**: Express JSON parser is restricted to `10mb` to protect against denial-of-service memory exhaustion via oversized payloads.

---

## 3. Efficiency, Caching & Database Performance

### 3.1 Plaid Incremental Delta Sync (Cursor-Based)
**Source**: [`backend/src/plaid/plaid.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/plaid/plaid.service.ts)

Rather than refetching historical transactions on every sync, Lunaria utilizes Plaid's `/transactions/sync` API with stateful cursors.

#### Function: `syncTransactions(itemId: string, providedUserId?: string)`
1. **Cursor Retrieval**: Reads the latest `cursor` string stored in `plaid_items.cursor`.
2. **Paging Loop**: Calls `plaidClient.transactionsSync({ access_token, cursor, count: 500 })`.
3. **Delta Processing**:
   * `added`: Batch inserts new transactions into `transactions` table.
   * `modified`: Batch updates existing transaction details (merchant name, categories, pending status).
   * `removed`: Batch deletes cancelled or reversed transactions.
4. **Batch Optimization (`CHUNK_SIZE = 100`)**:
   Inserts are batched in groups of 100 with `onConflictDoUpdate` targeting `transactions.plaidTransactionId`, avoiding N+1 database roundtrips:
   ```typescript
   await this.db
     .insert(transactions)
     .values(records)
     .onConflictDoUpdate({
       target: transactions.plaidTransactionId,
       set: { name, amount, date, pending, updatedAt: new Date() }
     });
   ```
5. **Cursor Persistence**: Saves `next_cursor` back to `plaid_items.cursor` inside an atomic transaction. If interrupted, the next sync resumes exactly where it left off.

---

### 3.2 TimescaleDB Hypertables & Portfolio Snapshot Interpolation
**Source**: [`backend/src/stocks/stocks.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/stocks/stocks.service.ts)

Historical investment performance and net worth charts require fast queries over millions of potential daily points. Lunaria uses TimescaleDB hypertables partitioned by time and composite indexed.

#### Key Functions:
* **`recordDailySnapshot(userId, accountId, balance, dateStr)`**:
  * Writes daily balances to `portfolio_snapshots`.
  * Relies on the unique index `(account_id, date)`. Writes are idempotently upserted via `onConflictDoUpdate`.
* **`reconstructHistoricalSnapshots(userId, accountId, currentBalance, days)`**:
  * **Reverse Balance Walk Algorithm**: When a user links an investment account with no previous daily snapshots, Lunaria computes past balances backwards:
    $$\text{Balance}_{t-1} = \text{Balance}_t - \text{Net Flow}_t$$
    where Net Flow is derived from `investment_transactions` (buys, sells, deposits, withdrawals).
  * **Zero-Filling & Forward Carry**: For days with no market transactions, it fills gaps forward to maintain a contiguous time series for charting without executing expensive rolling SQL window calculations on every API read.
* **`getPortfolioHistory(userId, timeframe)`**:
  * **Dynamic Downsampling**:
    * `1W`, `1M`: Returns daily points.
    * `1Y`: Returns weekly aggregated points.
    * `ALL` / `5Y`: Returns bi-weekly or monthly sampled points to keep frontend payload sizes under 50KB while rendering 60fps graphs.
* **`calculateHoldingWeightedReturn(holdings, marketHistory, days)`**:
  * Computes the exact portfolio weighted return:
    $$\text{Total Return} = \sum_{i=1}^{N} \left( w_i \times r_i \right) \quad \text{where} \quad w_i = \frac{\text{Value}_i}{\sum \text{Value}}$$
  * Replaces synthetic assumptions with individual position cost-basis calculations, matching institutional wealth platforms (like Monarch Money).

---

### 3.3 Budget Cascade & Carry-Forward Engine
**Source**: [`backend/src/budget/budget.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/budget/budget.service.ts)

#### Key Functions:
* **`getMonthlyBudget(userId: string, monthStr: string)`**:
  * Fetches category allocations and aggregates real transactions for the target month (`YYYY-MM-01` to `YYYY-MM-LastDay`).
  * Runs a single SQL aggregation query using `SUM(transactions.amount)` grouped by `categoryId`, avoiding per-category queries.
  * Calculates rollover surpluses/deficits:
    $$\text{Available} = \text{Budgeted} + \text{Carried Over} - \text{Spent}$$
* **`propagateToFutureMonths(userId, categoryId, newBudgeted, sourceMonth)`**:
  * When a user creates a new category or alters a budget in March, future sheets (April, May, June...) must reflect this plan automatically.
  * Scans future records in `budgets`. If a future month already exists but has not been manually customized, it updates the budgeted allocation. If future records do not exist, it automatically generates them on demand.

---

## 4. External Data Sources & Ingestion Pipelines

| External Provider | Protocol / Transport | Purpose in Lunaria | Credentials / Config Required |
| :--- | :--- | :--- | :--- |
| **Plaid** | HTTPS REST (Plaid Node SDK) | Banking, balances, transactions, investment holdings & securities | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` |
| **Google Cloud Identity** | OAuth 2.0 (HTTPS REST) | User authentication, identity tokens, profile photo & email | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| **Polygon.io / Market Data** | HTTPS REST | Stock ticker real-time and historical pricing benchmarks (S&P 500, US Total Stock, Bond) | `POLYGON_API_KEY` |
| **Resend** | HTTPS REST (`resend` SDK) | Transaction spending alerts, budget breach warnings, weekly digest emails | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **Web Push (VAPID)** | RFC 8291 / RFC 8292 (`web-push` SDK) | Browser OS-level push notifications to desktop and mobile devices | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

---

### 4.1 Plaid Data Pipeline
**Source**: [`backend/src/plaid/plaid.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/plaid/plaid.service.ts)

```
User (Browser) ──> Plaid Link UI ──> returns public_token ──> Backend /api/plaid/exchange
                                                                     │
                   ┌─────────────────────────────────────────────────┴───────────────────┐
                   ▼                                                                     ▼
1. Item Creation & Encryption:                                        2. Background Ingestion Tasks:
   - Exchange public_token for access_token                              - syncAccounts()
   - Encrypt access_token via AES-256-GCM                                - syncTransactions() (via cursor)
   - Store in `plaid_items` table                                        - syncInvestmentHoldings()
                                                                         - syncInvestmentTransactions()
```

#### Detailed Ingestion Functions:
* **`syncAccounts(itemId, accessToken, userId)`**:
  * Calls `plaidClient.accountsBalanceGet({ access_token })`.
  * Maps accounts into standard categories: `depository` (checking/savings), `credit` (credit cards), `investment` (brokerage/401k/IRA), `loan` (mortgages/student loans).
  * Records instantaneous current and available balances into `accounts`.
* **`syncInvestmentHoldings(itemId, accessToken, userId)`**:
  * Calls `plaidClient.investmentsHoldingsGet({ access_token })`.
  * Ingests two coupled entities:
    1. **Securities**: Symbol, official name, asset type (equity, ETF, mutual fund), currency, close price.
    2. **Holdings**: Linked to account, security ID, quantity, cost basis, total market value.
  * Records snapshot balance in `portfolio_snapshots` for today's date.
* **`handleWebhook(body)`**:
  * Receives asynchronous HTTP callbacks from Plaid for:
    * `SYNC_UPDATES_AVAILABLE`: Triggers background `syncTransactions`.
    * `HOLDINGS_DEFAULT_UPDATE`: Triggers background `syncInvestmentHoldings`.
    * `ITEM_LOGIN_REQUIRED`: Marks `plaid_items.status = 'login_required'` and dispatches an account disconnected notification.
* **`handleCronSync()`**:
  * Runs on a periodic schedule (`@Cron(CronExpression.EVERY_HOUR)`).
  * Automatically syncs all active Plaid items across all users in the background (accounts, cursor-delta transactions, investment holdings, and investment transactions) as a reliable safety fallback against missed webhooks or in local environments without tunnels.

---

### 4.2 Market Benchmark Ingestion (S&P 500, US Stocks, US Bonds)
**Source**: [`backend/src/stocks/stocks.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/stocks/stocks.service.ts)

To provide comparison charts against broad markets, Lunaria tracks standard benchmark ETF indices:
1. **S&P 500**: `SPY` (SPDR S&P 500 ETF Trust)
2. **US Total Stock Market**: `VTI` (Vanguard Total Stock Market Index ETF)
3. **US Total Bond Market**: `BND` (Vanguard Total Bond Market ETF)

#### Data Resolution:
* Benchmarks are normalized to a common origin baseline ($t_0 = 0\%$) matching the start date of the user's portfolio history.
* Daily adjusted closing prices are indexed and queried to calculate cumulative percentage performance:
  $$\Delta \%_t = \frac{\text{Price}_t - \text{Price}_0}{\text{Price}_0} \times 100$$
* Returns are aligned to exact calendar trading days, factoring in weekend and market holiday closures.

---

### 4.3 Notification & Push Pipeline
**Source**: [`backend/src/notifications/notifications.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/notifications/notifications.service.ts) & [`backend/src/notifications/push.service.ts`](file:///home/kitsu_/Desktop/coding/lunaria/backend/src/notifications/push.service.ts)

```
Trigger Event (e.g. Large Deposit, Budget > 100%)
       │
       ▼
`dispatchNotification(userId, payload)`
       │
       ├─► Check `notification_preferences` (Channel enabled? Minimum threshold met?)
       │
       ├─► 1. In-App: Insert into `notifications` table (read: false, dismissed: false)
       ├─► 2. Email: Dispatch via Resend API (`resend.emails.send()`)
       └─► 3. Web Push: Lookup subscriptions in `push_subscriptions` ──► `webpush.sendNotification()`
```

#### Key Functions:
* **`checkBudgetExceededAlerts(userId, activeMonth)`**:
  * Evaluates spending against budgets per category.
  * Dispatches an alert when spending crosses 100% of the assigned budget.
  * Implements deduplication: records the alert timestamp in `notifications` to prevent spamming the user on subsequent transaction imports within the same month.
* **`handleNewTransaction(userId, tx)`**:
  * Evaluates transactions against user thresholds (`depositMinAmount`, `expenseMinAmount`).
  * If a debit exceeds `$500.00` (or user preference), fires an immediate expense alert across enabled channels.
* **`sendPushToUser(userId, payload)`**:
  * Retrieves all active subscriptions from `push_subscriptions`.
  * Sends cryptographically signed push messages using VAPID keys.
  * **Automatic Dead-Subscription Cleanup**: If the push endpoint returns `410 Gone` or `404 Not Found` (meaning the user cleared browser data or uninstalled permissions), the expired subscription token is automatically deleted from the database.

---

## 5. Summary Checklist for Production Deployment

1. **Set Production `ENCRYPTION_KEY`**: Ensure a unique 32-byte key is generated before any real Plaid connections are created.
2. **Configure Domain URLs**: Update `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, and `PLAID_WEBHOOK_URL` from `localhost` to production HTTPS hostnames.
3. **Verify Resend Domain**: Ensure DKIM and SPF records are active for `RESEND_FROM_EMAIL` on [Resend.com](https://resend.com).
4. **Approve Plaid Production Secret**: Verify that `PLAID_ENV=production` uses the production client secret.
5. **Clear or Expand Email Whitelist**: Set `AUTH_WHITELIST_EMAILS` appropriately for closed beta vs. open public launch.
6. **Rotate Live Secrets**: Ensure all development/staging API keys and secrets in `.env` are rotated before pointing DNS to production.
