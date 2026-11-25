# shopdesk

**Every business. One desk. Now on the web.**

shopdesk is a cloud billing + inventory suite for **every kind of business** — kirana stores, pharmacies, electronics shops, bakeries, boutiques, cafes, hardware and wholesale. Full GST tax invoicing, barcode-fast POS, live stock control, udhaar (credit) khata, expense bookkeeping and accountant-ready reports — multi-tenant, signup in a minute, hosted anywhere Node runs.

This is the **v3.0 SaaS edition**: MongoDB + Vercel serverless, one click from this repo to a live deployment. It ships with a fully lived-in **demo workspace** (Shivam General Store — 924 sample GST bills across 75 days) so you can explore a working shop instead of an empty shell.

---

## Live tour (demo login)

| Role  | Email                 | Password   |
|-------|-----------------------|------------|
| Owner | `aarav@shopdesk.demo` | `demo1234` |
| Staff | `riya@shopdesk.demo`  | `demo1234` |

Sign in with either, or hit **Create workspace** on the same screen to open your own empty (or sample-data) shop in about a minute.

---

## Deploy to Vercel (5 minutes)

**1. Create a free MongoDB Atlas cluster** — [cloud.mongodb.com](https://cloud.mongodb.com) → free M0 tier → create a database user → get the connection string. In **Network Access**, allow `0.0.0.0/0` (Vercel's serverless IPs are dynamic), or use Vercel's private networking if you're on Enterprise.

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/shopdesk?retryWrites=true&w=majority
```

**2. Import this repo into Vercel** — [vercel.com/new](https://vercel.com/new) → pick the repo. Vercel detects Vite automatically; `vercel.json` already wires the SPA fallback and the serverless API.

**3. Add one environment variable** in the Vercel project → Settings → Environment Variables:

| Name          | Value                         |
|---------------|-------------------------------|
| `MONGODB_URI` | your Atlas connection string  |

**4. Deploy.** That's it. `npm run build` builds the SPA; `api/[...slug].js` serves every `/api/*` request as a function; `dist/` is served statically.

**5. Seed the demo workspace (optional).** From your machine, point the repo at Atlas and run:

```bash
MONGODB_URI="mongodb+srv://..." npm install
MONGODB_URI="mongodb+srv://..." npm run seed
```

You now have a `Shivam General Store` demo workspace with the sample history, plus a fresh workspace waiting for you behind the signup form.

> Self-hosting instead? Skip Vercel entirely — see **Run it yourself** below.

---

## Run it yourself (no Vercel)

You need Node ≥ 20 and any MongoDB 5+ (local `mongod`, Docker, or Atlas).

### Option A — Docker (the easy button)

```bash
docker compose up --build
# app on http://localhost:8787 — mongo + demo seed are handled for you
```

### Option B — plain Node

```bash
npm install
echo 'MONGODB_URI=mongodb://127.0.0.1:27017/shopdesk' > .env
npm run seed     # creates the demo workspace
npm run build
npm start        # http://localhost:8787
```

For frontend development with HMR: `npm run dev` (API on :8787) + `npm run dev:client` (Vite on :5173, proxies `/api`).

---

## What's inside

### Sell
- **Billing counter (POS)** — scan/search, category chips, cart with qty controls and per-line discounts, auto CGST/SGST or interstate IGST, bill-level discount, **cash-tender change calculator**, UPI/card/bank/udhaar modes, inline customer quick-add. F2 focuses search, Ctrl+Enter completes the sale.
- **Bills & Invoices** — filters, pagination, payment recording, CSV export, printable **GST tax invoice** (amount in words, live UPI QR).

### Stock
- **Products** — SKU/barcode (one-click generator), categories with colors, GST slabs, cost & margin, reorder levels, favorites, low/out alerts, **one-click +25 restock**, stock adjustment with reasons, full **movement ledger**, delete protection for billed products.
- **Purchases** — multi-line stock-in, supplier selection, cost price updates, stock lands automatically; delete reverses it.

### People
- **Customers (khata)** — GSTIN-aware, lifetime value, outstanding udhaar, visit history, slide-in drawer, "Bill now" deep-link.
- **Suppliers** — vendor book with purchase counts and all-time value.

### Money
- **Expenses** — month ledger with categories and breakdown.
- **Reports & GST** — Today/7D/30D/90D/FY 26–27/custom ranges, revenue/bills/avg-bill/items/tax KPIs with previous-period delta, daily revenue curve, payment-mix donut, top products, revenue by category, **CGST/SGST-wise GST summary**, CSV export.

### Platform (the SaaS part)
- **Multi-tenant workspaces** — every signup gets an isolated shop; all queries are scoped by `businessId` with compound unique indexes, so SKUs and bill numbers can repeat across tenants.
- **Signup & auth** — business + owner created in one step, optional **sample-data seeding** (924 bills) so the workspace feels alive instantly. Scrypt password hashing, httpOnly session cookies (30-day TTL index), owner/staff roles, rate-limited login.
- **Backup & restore** — one-click JSON export of the whole workspace; restore replaces only your workspace. v3 format (Mongo); the old SQLite-era v2 backups are rejected with a clear message.
- **Workspace lifecycle** — admin-only: **Load sample shop** (wipe + reseed demo data in your workspace) and **Clear all data** (fresh start, keeps logins & profile). Perfect for demos and hand-overs.
- **Plans** — every workspace starts on `trial` (14 days, all features, no card). Plan badge lives in Settings → Your account. (Billing is intentionally not faked — wire Stripe before charging anyone.)
- **The vibe** — aurora gradient field, film grain, floating receipt on the sign-in hero, word-rotating business types, animated KPIs, spring modals/toasts, confetti on every completed sale, ⌘K/Ctrl+K palette.

---

## Tech

| Layer     | Choice |
|-----------|--------|
| Frontend  | React 19, React Router 7, framer-motion, lucide-react, hand-rolled SVG charts & CSS design system |
| Backend   | Express 5 (ESM), zod validation — **same app** locally, in Docker, and as a Vercel function |
| Storage   | MongoDB via Mongoose 8 — per-tenant documents, string `id` exposed everywhere, atomic counters for bill/purchase numbers, TTL sessions, stock guarded by atomic `$inc` with compensation |
| Hosting   | Vercel (static SPA + serverless API) or anywhere Node ≥ 20 runs (`Dockerfile`, `docker-compose.yml`) |
| Tests     | `node --test` — billing math unit tests + API route-table/auth tests (no DB) · `tests/smoke.mjs` renders every route in jsdom against a live server |

### Scripts

```bash
npm run dev           # API server (+ serves dist/ if built), .env auto-loaded
npm run dev:client    # Vite HMR on :5173, proxies /api → :8787
npm run build         # production SPA build → dist/
npm start             # serve API + SPA on :8787
npm run seed          # create/refresh the shared demo workspace
npm test              # unit + API-surface tests (no database required)
npm run test:smoke    # render every route against a running server (needs MONGODB_URI + npm run seed)
```

### Environment variables

| Name              | Required | Default                            | Purpose |
|-------------------|----------|------------------------------------|---------|
| `MONGODB_URI`     | yes (prod) | `mongodb://127.0.0.1:27017/shopdesk` | MongoDB connection string |
| `MONGODB_MAX_POOL`| no       | `5`                                | pool size per serverless instance |
| `PORT`            | no       | `8787`                             | local/self-host port |

### API sketch

```
POST /api/auth/signup · POST /api/auth/login · POST /api/auth/logout · GET /api/auth/me
PUT  /api/auth/profile · POST /api/auth/change-password
GET  /api/dashboard · GET /api/health
CRUD /api/products (+ /:id/adjust-stock · /:id/movements) · CRUD /api/categories
CRUD /api/customers · GET /api/customers/:id (stats + recent bills) · CRUD /api/suppliers
GET  /api/invoices · POST /api/invoices · POST /api/invoices/:id/payments · DELETE /api/invoices/:id
GET  /api/purchases (+ POST · /:id · DELETE /:id) · CRUD /api/expenses
GET  /api/reports/summary · GET /api/reports/export (CSV)
GET  /api/settings · PUT /api/settings · POST /api/settings/load-sample · POST /api/settings/clear-data
GET  /api/backup · POST /api/restore · GET /api/search (⌘K) · GET /api/pay-qr (UPI QR)
```

### Backup format

`GET /api/backup` → `{ app: 'shopdesk', version: 3, exported_at, data: { business, users, categories, … } }`. The file contains password hashes — treat it like a secret. v2 (SQLite-era) backups are rejected explicitly.

### Project layout

```
api/[...slug].js   Vercel serverless entry (wraps the Express app, cached Mongo connection)
server/            app.js (routes) · index.js (self-hosted entry) · db.js (models) · auth.js · seed.js · billing.js
src/               React SPA (store, api client, pages, components, design system)
scripts/seed-demo.js  create/refresh the demo workspace
tests/             billing unit tests · API surface tests · jsdom smoke runner
vercel.json        framework config + SPA fallback   ·   Dockerfile · docker-compose.yml
```

### Operational notes & honest caveats

- **Concurrency**: stock decrement is guarded atomically at the database level; a failed sale restores reservations automatically. Bill numbering uses an atomic per-workspace counter. Multi-document transactions (Atlas replica sets) are not required.
- **Serverless cold starts**: first hit after idle may take ~1s while the Mongo pool warms; warm invocations reuse the cached connection.
- **Single database, shared collections**: tenants are isolated by `businessId`, not by database. For strict isolation per customer, migrate to Atlas workloads-with-tenant-identifiers or separate clusters.
- **Money & dates**: stored as `Number` (₹ up to 2^53 — fine) and `YYYY-MM-DD HH:MM:SS` strings (lexicographically comparable, matches GST invoicing needs).
- **No billing/payment collection is wired** — the trial badge is informational. Add Stripe Checkout when you're ready to charge; the `plan` field is already on the business document.
- Google Fonts load from the CDN in production; they degrade gracefully offline.

---

## Roadmap

- Stripe billing + plan enforcement hooks
- Team management (invite staff, per-role permissions matrix)
- Zoho Books / Tally export adapter
- WhatsApp bill sharing
- Offline-first PWA mode for billing counters

shopdesk v3.0 — the whole shop on one desk, hosted anywhere.
