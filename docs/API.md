# API Reference

Base URL: `http://localhost:3001/api` (development).
All request/response bodies are JSON unless noted. File uploads use
`multipart/form-data`.

---

## Transactions — `/api/transactions`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List transactions. Query: `account`, `type`, `source`, `search`, `card_id`, `from`, `to`, `limit`, `offset`. Returns `{ transactions, total }`. |
| GET | `/summary` | Dashboard aggregates (income/expense/invested, by month, by category, by account). Excludes the `Credit card` account. Query: `from`, `to`. |
| GET | `/business-pl` | Business profit & loss (ABN income + business accounts). Query: `from`, `to`. |
| POST | `/` | Create one transaction. |
| POST | `/bulk` | Create many: `{ transactions: [...] }`. |
| POST | `/import` | Upload a PDF bank statement (`file`) → returns parsed `{ preview }` for review (does not save). |
| PUT | `/:id` | Update a transaction. |
| DELETE | `/:id` | Delete a transaction. |

## Accounts — `/api/accounts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List distinct accounts. |
| GET | `/balances` | Current balance per account. |
| GET | `/networth` | Cumulative balance per account by month + combined total. Returns `{ months, accounts, series, total }`. |

## Cards — `/api/cards`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List cards. |
| GET | `/summary` | Cards with computed `charged`, `paid`, `balance`, `tx_count`. |
| GET | `/repayments` | Upcoming repayments (per-transaction instalments + per-card statement due dates). |
| POST | `/` | Create a card. |
| PUT | `/:id` | Update a card. |
| DELETE | `/:id` | Delete a card (transactions keep, lose the link). |
| POST | `/:id/pay` | Record a payment: `{ amount, date, account }`. Creates an expense on the chosen account, category `Credit card payment`, linked to the card. |
| POST | `/:id/import-statement` | Upload the card's PDF statement (`file`) → `{ preview }` for review. |

## Goals — `/api/goals`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List goals. |
| POST | `/` | Create: `{ name, target_amount, current_amount, account, deadline }`. |
| PUT | `/:id` | Update. |
| DELETE | `/:id` | Delete. |

## Categories — `/api/categories`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List categories. |
| POST | `/` | Create: `{ name }`. |
| PUT | `/:id` | Rename. |
| DELETE | `/:id` | Delete. |

## Category rules — `/api/category-rules`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List learned rules (`keyword → category`, with hit count). |
| POST | `/learn` | Reinforce/learn a rule from `{ description, category }`. |
| POST | `/match` | Match descriptions: `{ descriptions: [...] }` → `{ matches: [category|null, …] }`. |
| PUT | `/:id` | Edit a rule. |
| DELETE | `/:id` | Delete a rule. |

## Tax — `/api/tax`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Current rates `{ abn_tax_rate, gst_rate }`. |
| PUT | `/` | Update rates: `{ abn_tax_rate, gst_rate }`. |
| GET | `/estimate` | Estimate reserve & GST + income by source. Query: `from`, `to`. |

## Imports — `/api/imports`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List import history. Query: `source` (`general` \| `statement`). |
| POST | `/` | Log an import: `{ filename, file_type, source, card_id?, row_count }`. |
| DELETE | `/:id` | Remove a history record (does **not** delete the imported transactions). |

## Receipts — `/api/receipts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scan` | Upload an image (`file`) → OCR → `{ image_file, merchant, amount, date, raw_text }`. Saves the image, no transaction yet. |
| POST | `/confirm` | Create a transaction + store the receipt: `{ image_file, merchant, amount, date, category, account, type }`. |
| GET | `/` | List stored receipts. |
| GET | `/image/:file` | Serve a stored receipt image. |
| DELETE | `/:id` | Delete a receipt + its image (transaction stays). |

## Health — `/health`

`GET /health` → `{ status: 'ok', timestamp }`. Note: served at the server root,
not under `/api`.
