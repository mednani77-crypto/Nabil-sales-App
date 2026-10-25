# Nabil Sales Assistant — Technical Specification

Status: v1 (phase 1 implemented). Owner: Mohamad. User: Nabil Adel (SYSCO sales rep).
The original Arabic product brief is in [`brief-ar.md`](brief-ar.md). The approved UI design is in [`../design/`](../design/).
If this spec and the brief disagree, the brief wins — fix the spec.

---

## 1. Product in one paragraph

A personal, Arabic (RTL), offline-first PWA for one truck sales rep. He receives goods from the
company (which become his debt at selling price), sells them cash/credit/partial, collects customer
debts into three "work money" wallets (cash, personal CBE, personal Ebirr) or directly into company
bank accounts, pays the company, tracks the bank-transfer notices he must post to a WhatsApp group,
and prints account statements in 5 languages. Not an ERP: no roles, no approvals, no profit,
no salary, no forced day close.

## 2. Non-negotiable accounting rules

1. **Append-only operations.** Every business event is one immutable `Operation` with a UUID
   generated on the device. Operations are never edited or hard-deleted. A mistake is corrected
   with a new operation (`void` referencing the original, or an adjusting operation).
2. **Balances are derived, never stored.** Stock, customer balances, wallets and the company
   account are computed from operations (`src/domain/postings.ts`). Caches are allowed only if
   they can be rebuilt from operations at any time.
3. **Money is integer santim** (1 birr = 100 santim). Never use floats for money. Quantities are
   integers in the item's **base unit** (its smallest unit).
4. **Prices are snapshotted** on every operation line (unit name, unit factor, unit price). Changing
   an item's price later never changes history.
5. **Prices are free.** Nabil types any price; the app only *suggests* the last price used.
   No price locks, no min/max.
6. **A sale never reduces Nabil's company debt.** Only payments to the company and company-accepted
   returns do.
7. **No double counting.** A customer payment that lands directly in a company bank account is ONE
   operation that credits the customer AND credits the company account (unconfirmed), and creates ONE
   notice to track. Paying the company later must never touch customer balances.
8. **Opening stock is never charged to the company account** — it is assumed to be inside the
   opening company balance.
9. **Idempotency.** Saving or syncing the same operation id twice is a no-op.

## 3. Accounts and sign convention

Every posting is `{ account, debit, credit }` in santim. Balance of an account = Σdebit − Σcredit.

| Account key | Meaning | Positive balance means |
|---|---|---|
| `company` | Nabil's running account at SYSCO | Nabil owes the company |
| `customer:<id>` | One per customer (incl. temporary debts) | Customer owes Nabil |
| `wallet:cash` / `wallet:cbe` / `wallet:ebirr` | Work money Nabil holds | Money on hand (work money only, not his whole bank balance) |

Stock is tracked separately as `StockMove { itemId, qty (base units, signed) }`.

## 4. Operations and their postings

| Type | Stock | Postings |
|---|---|---|
| `receive` (goods from company) | + lines | company Dr total |
| `sale` | − lines | customer Dr total (if customer). Paid part: if destination is a wallet → wallet Dr paid, customer Cr paid. If destination is a company bank → company Cr paid (unconfirmed) and customer Cr paid, plus a notice |
| `collection` | — | customer Cr amount; wallet Dr amount, OR company Cr amount (unconfirmed) + notice |
| `transfer` | — | wallet A Cr, wallet B Dr |
| `companyPayment` | — | wallet Cr amount, company Cr amount (unconfirmed) + notice |
| `noticeStatus` (phase 3) | — | none; moves notice `recorded → sent → confirmed` |
| `customerReturn` (phase 4) | + if good, 0 if damaged | customer Cr value; if refunded in cash also customer Dr value + wallet:cash Cr value |
| `companyReturn` (phase 4) | − lines | none until accepted |
| `companyReturnDecision` (phase 4) | + lines back if rejected | if accepted: company Cr value |
| `stockCount` (phase 4) | ± differences | **none** (never touches money) |
| `opening` (phase 4) | + opening stock | company / customers / wallets opening balances; no company debit for stock |
| `void` | reverses the referenced op | reverses the referenced op's postings |

Sale without a customer and with an unpaid remainder creates a **temporary customer**
(`temp: true`, code `D-0001`, `D-0002`, …) in the same transaction, so anonymous debts never mix.
The temporary customer can be renamed later; its id never changes.

"Confirmed by company" is a property of the notice, not a separate posting. The company balance
always includes unconfirmed payments; the UI shows "of which unconfirmed: X".

## 5. Units

- Each item has 1–4 units from: كنتال، كرتون، جونية، حبة (Nabil may add others later).
- Every unit has `factor` = how many base units it contains. The base unit has factor 1.
  Example: oil → كرتون (6), حبة (1). Rice → كنتال (4), جونية (1). Sugar → جونية (1) only.
- Factors are per item. Never assume a global conversion.
- Display of a base quantity is a greedy decomposition into the item's units, largest first:
  64 pieces of oil = `10 كرتون + 4 حبة`. When the remainder is in حبة, the item has an
  **open pack**, shown with a badge.
- Each unit keeps its own `lastPrice` (a suggestion only).

## 6. Data storage

- **On device:** IndexedDB via Dexie (`src/db/`). Tables: `operations`, `items`, `customers`, `meta`, `attachments` (photos linked to an operation; a newer photo replaces the shown one, older ones are kept).
- Creation timestamps are strictly increasing per device (`stamp()`), so fast successive status changes keep their order.
- **Cloud (phase 5):** Supabase (Postgres + Auth + Storage for notice images).
- **Master data** (items, customers) are small mutable records with `updatedAt`; on sync, last write
  wins per record. **Operations** are append-only and merge by union on id — two devices can never
  lose each other's operations.
- **Document numbers** must be unique across devices while offline: `<deviceCode>-<seq>`
  (e.g. `A-1044`). Device code is assigned at first launch.

## 7. Sync (phase 5)

- Each operation has `syncState: 'local' | 'synced'`.
- Upload: POST batches of local operations; server upserts by id (idempotent); mark synced on ack.
- Download: pull operations with `serverSeq > lastSeq`.
- Images (notice photos) upload separately, referenced by operation id.
- Retry on app open / `online` event; no reliance on background sync.
- UI shows: online/offline, pending count, last sync time, errors.

## 8. Statements and reports (phase 6)

- Mandatory columns: full date | description | debit | credit | running balance.
- Header: account holder, currency (ETB), period, carried-forward balance (computed from all
  operations before the period — never start at zero), totals, closing balance.
- Period filters: one day, one month, free from–to.
- Languages: Arabic (RTL), English, Somali, Amharic (Noto Sans Ethiopic), Oromo. Names, amounts and
  reference numbers are never translated. Non-Arabic/English terms need native-speaker review.
- PDF generated from HTML (print to PDF), not from libraries that break Arabic shaping.
- Excel export via SheetJS.

## 9. Phases

| # | Scope | Status |
|---|---|---|
| 1 | App shell, PWA, local DB, items & units, truck stock, receive goods, sale invoice (cash/credit/partial, temp debt, payment destination), invoices list/detail, customers list/create, home dashboard, demo data | **done** |
| 2 | Customer detail & ledger, late customers, collections (4 methods, optional invoice link), wallets & transfers, company account & payments, duplicate-transfer warning | **done** |
| 3 | Bank notices: photo (compressed, stored as attachment), WhatsApp share sheet, recorded → sent → confirmed via append-only `noticeStatus` ops, counts and alerts | **done** |
| 4 | Returns (customer & company), stock count, opening balances wizard, void | next |
| 5 | Supabase auth, sync, multi-device, backup/restore | |
| 6 | Statements PDF in 5 languages, reports, Excel export | |
| 7 | Two-week parallel run with Nabil's paper notebook | |

## 10. Definition of done for every phase

- Domain logic is pure TypeScript in `src/domain/` with Vitest tests for every rule touched.
- `npm test` and `npm run build` pass (CI runs both on every PR).
- UI matches the design in `design/` (Arabic RTL, ≥44px touch targets, one-handed use).
- No money as float, no stored balances, no edited operations.
