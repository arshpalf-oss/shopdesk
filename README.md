# shopdesk

**Every business. One desk.**

shopdesk is a full-stack inventory + billing suite for **every kind of business** — kirana stores, pharmacies, electronics shops, bakeries, boutiques, cafes, hardware and wholesale. It ships with GST tax invoices, barcode-fast POS billing, live stock control, udhaar (credit) tracking, expenses, purchases, and accountant-ready reports — all wrapped in a dark, animated, keyboard-first interface.

It boots with a **lived-in demo business** (Shivam General Store, Mathura — 924 sample GST bills across 75 days, 60 products, categories, suppliers, expenses and two demo logins), so the app feels alive the moment it opens.

---

## Quick start

```bash
npm install        # requires Node ≥ 22.5 (uses the built-in node:sqlite — zero native builds)
npm run build      # build the SPA into dist/
npm start          # http://localhost:8787  → API + app on one port
```

For development with hot reload:

```bash
npm run dev        # API on :8787  (auto-seeds the demo DB on first run)
npm run build      # and in another shell, serve dist/ via the same server,
                   # or `npx vite dev` for HMR with /api proxied to :8787
```

**Demo logins** (also shown on the sign-in screen):

| Role  | Email               | Password   |
|-------|---------------------|------------|
| Owner | `aarav@shopdesk.demo` | `demo1234` |
| Staff | `riya@shopdesk.demo`  | `demo1234` |

Reset the demo data any time from **Settings → Danger zone → Reset demo data** (admin).

---

## What's inside

### Sell
- **Billing counter (POS)** — scan/search products, category chips, live cart with qty controls, per-line discounts, auto CGST/SGST or interstate IGST, bill-level discount, **cash-tender change calculator**, UPI/card/bank/credit (udhaar) payment modes, quick-add customer inline. F2 focuses search, Ctrl+Enter completes the sale.
- **Bills & Invoices** — filter by status/date/search, pagination, view, **record payments** against partial/unpaid bills, delete (admin, restores stock), **CSV export**, printable **GST tax invoice** with amount-in-words and a **live UPI QR**.

### Stock
- **Products** — full CRUD with SKU, barcode (one-click random generator), categories (with colors), units, GST rate slabs, cost & margin %, reorder levels, favorites, **low/out-of-stock alerts**, one-click **+25 quick restock** from the dashboard, **stock adjustment** with reasons, **stock movement history** (opening / sale / purchase / adjustment), and per-product delete protection once used in a saved bill.
- **Purchases** — multi-line stock-in with supplier selection; quantities land in stock and cost price updates automatically; delete reverses stock (admin).

### People
- **Customers (khata)** — GSTIN-aware contacts, lifetime value, bill count, outstanding udhaar, last visit, slide-in detail drawer with recent bills, "Bill now" deep-link into the POS with the customer preselected.
- **Suppliers** — vendor book with purchase counts and all-time purchase value, GSTIN tracking for input tax credit.

### Money
- **Expenses** — month-navigable ledger with category filters and a where-the-money-went breakdown.
- **Reports & GST** — Today / 7D / 30D / 90D / FY-26-27 or custom range; revenue, bills, avg bill, items sold, tax collected, gross & net profit (expenses netted out), daily revenue curve, payment-mix donut, top products, revenue by category, and a **CGST/SGST-wise GST summary table** ready for your CA. CSV export for any range.

### Everywhere
- **⌘K / Ctrl+K command palette** — jump anywhere, search products/customers/bills, quick actions.
- **Dashboard** — animated KPIs (today vs yesterday, month vs last month, udhaar, low stock), 30-day revenue chart with hover tooltip, live bills ticker, one-tap restock.
- **Auth** — scrypt-hashed passwords, httpOnly session cookies (30 days), owner/staff roles, per-route protection, login rate-limiting.
- **Backup & restore** — one-click JSON export of every table; restore on any machine; portable demo reset.
- **The vibe** — aurora gradient field, grain, floating receipt on the login hero, word-rotating business types (kirana → pharmacy → bakery…), animated KPIs, spring modals/toasts/drawer, confetti on every completed sale, and full keyboard navigation.

---

## Tech

| Layer     | Choice |
|-----------|--------|
| Frontend  | React 19, React Router 7, framer-motion, lucide-react, hand-rolled SVG charts & CSS design system |
| Backend   | Express 5 (ESM), zod validation, scrypt auth |
| Storage   | SQLite via the built-in `node:sqlite` (`data/shopdesk.sqlite`) — **zero native dependencies**, WAL mode, transactional integrity for stock/bills |
| Tests     | `node --test` DB/seed invariants + a jsdom-based browser-less smoke test that renders every route against the real API |

### Scripts

```bash
npm run dev         # API server (serves dist/ if built)
npm run build       # production SPA build
npm start           # production mode
npm run seed        # wipe & reseed the demo business
npm test            # DB + seed invariant tests (temp database)
npm run test:smoke  # render every route in jsdom against a running server
```

### Data model (SQLite)

`business` (single-row profile) · `users` + `sessions` · `categories` · `products` · `customers` · `suppliers` · `invoices` + `invoice_items` + `payments` · `purchases` + `purchase_items` · `expenses` · `stock_movements` (audit ledger) · `counters` (invoice/purchase numbering).

Billing math is computed **server-side** in a single transaction: stock is validated and decremented, invoice + items + payment + stock movements are written atomically, and failures roll back cleanly.

### API sketch

```
POST /api/auth/login|logout · GET /api/auth/me · PUT /api/auth/profile · POST /api/auth/change-password
GET  /api/dashboard
CRUD /api/products · POST /api/products/:id/adjust-stock · GET /api/products/:id/movements
CRUD /api/categories · CRUD /api/customers · GET /api/customers/:id (stats + recent bills) · CRUD /api/suppliers
GET  /api/invoices · GET /api/invoices/:id · POST /api/invoices · POST /api/invoices/:id/payments · DELETE /api/invoices/:id
GET  /api/purchases · GET /api/purchases/:id · POST /api/purchases · DELETE /api/purchases/:id
CRUD /api/expenses · GET /api/reports/summary?from&to · GET /api/reports/export?from&to (CSV)
GET/PUT /api/settings · GET /api/backup · POST /api/restore · POST /api/reset-demo
GET  /api/search?q=… (⌘K) · GET /api/pay-qr?amount&note (UPI QR for the printed bill)
```

### Docker

```bash
docker build -t shopdesk .
docker run -p 8787:8787 -v shopdesk-data:/app/data shopdesk
```

The image builds the SPA, installs production deps only, runs as non-root, and persists the database in `/app/data`.

---

## Project layout

```
server/    index.js (API + static host) · db.js (schema) · auth.js · seed.js (demo data)
src/       App.jsx (router) · store.jsx (session/business context) · api.js · styles.css (design system)
           components/ (Layout, CommandPalette, ui.jsx — toasts/modals/charts/KPIs)
           pages/ (Login, Dashboard, Billing, Invoices, Products, Purchases,
                   Customers, Suppliers, Expenses, Reports, Settings, PrintInvoice)
tests/     inventory.test.js · smoke.mjs
```

shopdesk v2.0 — built for Indian retail, ready for everywhere.
