# Finance Dashboard

A personal finance dashboard for tracking income, expenses, investments, credit
cards, savings goals and tax set-aside across multiple accounts and income types
(TFN salary, ABN business, and cash). Built for an Australian sole-trader /
student context, but general enough for anyone who wants a private, self-hosted
money tracker.

> **Privacy first.** Your data lives in *your* database (Neon Postgres) and runs
> on *your* machine. Nothing is sent to a third party.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Detailed setup](#detailed-setup)
- [Environment variables](#environment-variables)
- [How the money model works](#how-the-money-model-works)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Useful links](#useful-links)

---

## Features

| Area | What it does |
|------|--------------|
| **Overview** | Income / expense / invested / net-savings metrics, monthly cash-flow chart, spending-by-category donut, account balances, and **net worth over time** (one line per account + combined total). |
| **Transactions** | Searchable, filterable, paginated ledger (100/page). Inline edit & delete. CSV / Excel / PDF import with a review step. History of imported files. |
| **Business** | ABN profit & loss view for tax time — income, deductible expenses by category, monthly income-vs-expense chart, and an account-to-account transfer tool. |
| **Cards** | Multiple credit cards with balance, utilization, charges and repayments. Per-card detail with spending charts and transaction list. Pay-card flow, PDF statement import, and upcoming-repayment tracking. |
| **Receipts** | Photograph or upload a receipt → OCR reads the **merchant, amount and date** → review & confirm → a transaction is created and the image is stored in a browsable gallery. |
| **Tax reserve** | Estimated ABN tax set-aside and GST, with an income-by-source breakdown. |
| **Goals** | Savings goals with progress bars. |
| **Settings** | Tax rates, category management, and **auto-categorization rules** that the app learns from your edits and imports. |

---

## Tech stack

**Frontend**
- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) (fast dev server & build)
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [React Router](https://reactrouter.com/) for navigation
- [Recharts](https://recharts.org/) for charts
- [lucide-react](https://lucide.dev/) icons
- [PapaParse](https://www.papaparse.com/) (CSV) and [SheetJS](https://sheetjs.com/) (Excel) for client-side imports

**Backend**
- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- [node-postgres (`pg`)](https://node-postgres.com/) for database access
- [Multer](https://github.com/expressjs/multer) for file uploads
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) for bank/card statement parsing
- [Tesseract.js](https://github.com/naptha/tesseract.js) for receipt OCR (swappable for a cloud OCR provider)

**Database**
- [Neon](https://neon.tech/) — serverless Postgres (works with any standard Postgres too)

---

## Project structure

```
finance-dashboard/
├── backend/                     # Node + Express API
│   ├── src/
│   │   ├── index.js             # App entry, route mounting, CORS
│   │   ├── db/
│   │   │   ├── pool.js          # Postgres connection (Neon or local)
│   │   │   └── setup.js         # Idempotent table creation / migrations
│   │   ├── middleware/
│   │   │   └── errors.js        # 404 + error handlers
│   │   ├── lib/                 # Parsers (statements, receipts)
│   │   │   ├── pdfParser.js
│   │   │   ├── cardStatementParser.js
│   │   │   └── receiptParser.js # OCR engine behind a swappable interface
│   │   ├── routes/              # One file per resource
│   │   │   ├── transactions.js
│   │   │   ├── accounts.js
│   │   │   ├── cards.js
│   │   │   ├── goals.js
│   │   │   ├── categories.js
│   │   │   ├── categoryRules.js
│   │   │   ├── tax.js
│   │   │   ├── imports.js
│   │   │   └── receipts.js
│   │   └── scripts/
│   │       └── fetch-ocr-data.js  # One-time OCR language-model download
│   ├── .env.example
│   └── package.json
│
├── frontend/                    # React + Vite + Tailwind app
│   ├── src/
│   │   ├── main.jsx             # Entry (providers + router)
│   │   ├── App.jsx              # Routes
│   │   ├── index.css           # Tailwind layers + component classes
│   │   ├── api/
│   │   │   ├── client.js        # fetch wrapper + base URL
│   │   │   └── endpoints.js     # Feature-grouped API calls
│   │   ├── context/
│   │   │   ├── AppContext.jsx   # Categories, period filter, health, refresh
│   │   │   └── ToastContext.jsx # Toast notifications
│   │   ├── lib/
│   │   │   └── format.js        # Money formatting, colors, constants
│   │   ├── components/
│   │   │   ├── Layout.jsx       # Responsive shell (sidebar + bottom nav)
│   │   │   ├── Charts.jsx       # Recharts wrappers
│   │   │   ├── ui/index.jsx     # Card, Button, Modal, Metric, …
│   │   │   ├── PageActions.jsx
│   │   │   ├── SharedModals.jsx # Import + Add cash
│   │   │   ├── CardModals.jsx   # Add/Pay/Import-statement
│   │   │   └── EditTransactionModal.jsx
│   │   └── pages/               # One file per screen
│   │       ├── Overview.jsx
│   │       ├── Transactions.jsx
│   │       ├── Business.jsx
│   │       ├── Cards.jsx
│   │       ├── Receipts.jsx
│   │       ├── Tax.jsx
│   │       ├── Goals.jsx
│   │       └── Settings.jsx
│   ├── .env.example
│   └── package.json
│
├── docs/                        # Additional documentation
│   ├── API.md                   # Full endpoint reference
│   └── ARCHITECTURE.md          # How the pieces fit together
│
└── README.md                    # You are here
```

---

## Quick start

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env            # then paste your Neon DATABASE_URL
npm run db:setup                # create tables
npm run ocr:setup               # download OCR model (one time, ~11 MB)
npm run dev                     # → http://localhost:3001

# 2. Frontend (in a second terminal)
cd frontend
npm install
npm run dev                     # → http://localhost:5173
```

Open **http://localhost:5173**, go to **Settings → Load sample data** (or the
**Load sample** button in the header) to populate the dashboard, and you're away.

---

## Detailed setup

### Prerequisites
- **Node.js 18+** and npm
- A **Neon** account (free tier is plenty) — or any Postgres database

### 1. Create a Neon database
1. Sign up at [neon.tech](https://neon.tech/) and create a project.
2. Open **Connection Details** and copy the **connection string** — it looks like
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`.

### 2. Configure the backend
```bash
cd backend
npm install
cp .env.example .env
```
Open `.env` and set `DATABASE_URL` to your Neon connection string.

### 3. Create the database tables
```bash
npm run db:setup
```
This is **idempotent** — safe to run repeatedly. It creates every table and adds
any missing columns.

### 4. Download the OCR language model (for receipts)
```bash
npm run ocr:setup
```
Downloads `eng.traineddata.gz` (~11 MB) into `backend/lang-data/` so receipt OCR
works offline and doesn't re-download on each start. Skip this if you don't plan
to use the Receipts feature.

### 5. Run both servers
```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```
The Vite dev server proxies `/api/*` to the backend on port 3001, so no CORS
config is needed in development.

### Production build
```bash
cd frontend
npm run build          # outputs static files to frontend/dist
npm run preview        # preview the production build locally
```
Deploy `frontend/dist` to any static host (Vercel, Netlify, Cloudflare Pages) and
set `VITE_API_URL` to your deployed backend's `/api` URL. Deploy the backend to a
Node host (Render, Railway, Fly.io) with the same env vars, and set `FRONTEND_URL`
to your frontend's origin so CORS allows it.

---

## Environment variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes* | Neon/Postgres connection string (includes SSL). |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | No | Used only if `DATABASE_URL` is empty (local Postgres). |
| `PORT` | No | API port (default `3001`). |
| `NODE_ENV` | No | `development` or `production`. |
| `FRONTEND_URL` | No | Deployed frontend origin, allowed by CORS in production. |

\* Either `DATABASE_URL` **or** the individual `DB_*` values.

### Frontend (`frontend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | API base URL for production builds (e.g. `https://api.example.com/api`). Leave blank in dev to use the Vite proxy. |

---

## How the money model works

A few deliberate design rules keep the numbers honest:

- **Credit-card charges are excluded from the main dashboard.** Your Overview
  totals reflect your real cash position. Card spending only affects the
  dashboard when you *pay* the card.
- **Card balance owed** = charges − payments (a payment is either a bank-side
  "Credit card payment" linked to the card, or a card-side credit).
- **Transfers** move money between your own accounts. They change account
  balances but never count as income or expense.
- **Amounts are always shown to 2 decimal places** — no rounding or "k"
  abbreviation — so figures match your bank to the cent.
- **Tax estimate**: ABN income × the reserve rate (default 28%), plus a GST
  estimate (default 10%). These are *estimates only* — consult a registered tax
  agent for your actual obligations.

---

## API reference

See [`docs/API.md`](docs/API.md) for the full endpoint list. In brief, the API is
mounted under `/api`:

```
/api/transactions      ledger CRUD, summary, business P&L, bulk + file import
/api/accounts          balances, net worth over time
/api/cards             cards CRUD, summary, repayments, pay, import-statement
/api/goals             savings goals CRUD
/api/categories        category CRUD
/api/category-rules    auto-categorization learn / match / manage
/api/tax               tax rates + estimate
/api/imports           uploaded-file history
/api/receipts          OCR scan, confirm, gallery, image serving
/health                liveness check
```

---

## Troubleshooting

**`Cannot find module './routes/…'`**
A route file isn't where Node expects. Every route lives in
`backend/src/routes/`. Run `find backend -name '<file>.js'` to locate it and move
it into that folder.

**`MODULE_NOT_FOUND` for `fetch-ocr-data.js`**
The `backend/src/scripts/` folder may be missing. Create it
(`mkdir -p backend/src/scripts`) and ensure the file is inside, or download the
OCR model directly:
```bash
cd backend && mkdir -p lang-data
curl -L "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz" -o lang-data/eng.traineddata.gz
```

**Database connection errors**
Confirm `DATABASE_URL` is set and includes `?sslmode=require`. Neon databases
sleep when idle — the first request after a pause can take a second or two.

**OCR is slow or inaccurate**
The first scan loads the language model into memory. Accuracy depends on photo
quality — good lighting and a flat, straight image help a lot. The review step
lets you correct anything before saving. To upgrade, swap the `ocrImage()`
function in `backend/src/lib/receiptParser.js` for a cloud OCR API.

**CORS errors in production**
Set `FRONTEND_URL` on the backend to your frontend's exact origin.

---

## Useful links

- **Neon (database):** https://neon.tech/ · [docs](https://neon.tech/docs)
- **React:** https://react.dev/
- **Vite:** https://vitejs.dev/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Recharts:** https://recharts.org/
- **Express:** https://expressjs.com/
- **node-postgres:** https://node-postgres.com/
- **Tesseract.js:** https://github.com/naptha/tesseract.js
- **Author:** [GitHub @red-devil002](https://github.com/red-devil002) · [LinkedIn](https://linkedin.com/in/swetang-pandit/)

---

_Built as a personal data-engineering & full-stack project. Not financial or tax advice._
