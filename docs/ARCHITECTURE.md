# Architecture

A short tour of how the pieces fit together.

## Overview

```
┌─────────────────┐     HTTP /api/*      ┌──────────────────┐     SQL      ┌──────────────┐
│  React frontend │ ───────────────────► │  Express backend │ ───────────► │ Neon Postgres│
│  (Vite + TW)    │ ◄─────────────────── │  (Node)          │ ◄─────────── │              │
└─────────────────┘     JSON / files     └──────────────────┘    rows      └──────────────┘
```

- **Frontend** is a single-page React app. In dev, Vite proxies `/api` to the
  backend so there are no CORS issues. In production it's static files that call
  the backend at `VITE_API_URL`.
- **Backend** is a thin Express layer: one router per resource, a shared
  Postgres pool, and a couple of parsing libraries.
- **Database** is Neon (serverless Postgres). The schema is created and migrated
  idempotently by `db/setup.js`.

## Frontend layers

1. **`api/`** — the only place that talks HTTP. `client.js` wraps `fetch` and
   resolves the base URL; `endpoints.js` groups calls by feature so components
   never build URLs.
2. **`context/`** — cross-cutting state: `AppContext` holds categories, the
   period filter, backend health, and a `refreshKey` that pages watch to reload
   after a mutation. `ToastContext` provides notifications.
3. **`components/`** — reusable UI: a responsive `Layout` (sidebar on desktop,
   bottom nav on mobile), `Charts` (Recharts wrappers), `ui/` primitives
   (`Card`, `Button`, `Modal`, `Metric`, …), and shared modals.
4. **`pages/`** — one component per screen, composing the above. Each page
   fetches its own data and reacts to `refreshKey`.

### Data refresh pattern

Mutations (create/edit/delete/import) call `triggerRefresh()` from `AppContext`,
which bumps `refreshKey`. Every page's data `useEffect` depends on `refreshKey`,
so the relevant views reload automatically — no manual cache invalidation.

## Backend layers

- **`index.js`** wires up CORS (any localhost in dev, `FRONTEND_URL` in prod),
  JSON parsing, the routers, and error middleware.
- **`db/pool.js`** creates a single shared `pg` Pool. It prefers `DATABASE_URL`
  (Neon) and falls back to discrete `DB_*` vars for local Postgres. A type
  parser keeps `DATE` columns as `YYYY-MM-DD` strings to avoid timezone drift.
- **`db/setup.js`** is the migration script — `CREATE TABLE IF NOT EXISTS` plus
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so it's safe to run anytime.
- **`routes/`** — each file owns one resource and returns JSON. Business logic
  (e.g. card balance = charges − payments) lives here.
- **`lib/`** — pure parsing modules:
  - `pdfParser.js` — generic bank-statement text → transactions.
  - `cardStatementParser.js` — credit-card statement specifics.
  - `receiptParser.js` — OCR (`ocrImage`) + field extraction. The OCR engine is
    isolated in one function so it can be swapped for a cloud provider later
    without touching callers.

## Key domain rules

These live in the backend and are reflected in the UI:

- The dashboard summary **excludes** the `Credit card` account, so card charges
  don't distort your real cash position.
- A **card balance** is `charged − paid`, where `paid` counts both card-side
  credits and bank-side `Credit card payment` transactions linked by `card_id`.
- **Transfers** (`type = 'transfer'`) move money between accounts and are
  excluded from income/expense aggregates.
- The **net worth** endpoint accumulates each account's signed monthly net into a
  running balance, then sums accounts per month for the total line.

## Database tables

`transactions`, `cards`, `goals`, `categories`, `category_rules`, `imports`,
`receipts`, and a small `tax_settings` row. See `db/setup.js` for exact columns.
