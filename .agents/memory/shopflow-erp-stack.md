---
name: ShopFlow ERP stack
description: Key stack decisions, port, workflow, and API patterns for this project.
---

## Setup after import
- `pnpm install` at repo root installs the monorepo's node_modules (esbuild, vite, etc.) — a fresh import/clone won't have them yet, causing `ERR_MODULE_NOT_FOUND: esbuild` and `vite not found` on first workflow run.
- **Why:** node_modules is gitignored; imported repos ship code only.
- The API server workflow can report a false-positive port-open timeout on first boot (esbuild bundling + pino transports take a while) even though it ends up listening fine — check the tail of its log for "Server listening" before assuming it's broken.

## Runtime / ports
- API server: port 8080, workflow `artifacts/api-server: API Server`
- Frontend: port 5000, workflow `artifacts/shopflow-erp: web`
- API command: `node ./build.mjs && PORT=8080 node --enable-source-maps ./dist/index.mjs`

## Codegen
- After every OpenAPI spec change run: `pnpm --filter @workspace/api-spec run codegen`
- This regenerates `lib/api-client-react/src/generated/api.ts` and the zod types
- The codegen causes a momentary Vite pre-transform error on the generated files (race condition) — Vite recovers automatically; not a real error

## DB push
- Schema changes: edit `lib/db/src/schema/*.ts`, then `pnpm --filter @workspace/db run push`
- No migration files needed for dev; push applies directly

## API route ordering in Express
- Static segments MUST be defined before dynamic `:id` routes in the same router
- e.g. `GET /customers/dwolla-status` must come before `GET /customers/:id`

## Dwolla integration (Task #6)
- `artifacts/api-server/src/dwolla.ts` — client module, call `isDwollaConfigured()` before any API call
- Routes: `GET /customers/dwolla-status`, `POST /customers/:id/link-dwolla`, `GET /customers/:id/balance`
- All Dwolla routes return 503 when `DWOLLA_CLIENT_ID` or `DWOLLA_CLIENT_SECRET` are missing
- Frontend checks `useGetCustomerDwollaStatus()` to disable the Link button before the user clicks

## Ledger patterns
- Customer ledger: built from invoices + payment entries; payment date uses `i.updatedAt` (not `createdAt`)
- Supplier ledger: built from `paymentsTable` filtered by `entityType = "supplier"` and `entityId = supplierId`
- Running balance: computed server-side, returned as `balance` field on each `LedgerEntry`

## Print statements
- `printStatement(entity, entries)` accepts `StatementEntry[]` directly — use this when you have ledger data
- `printSupplierStatement` was removed in favour of `printStatement` with ledger entries

## Credit Note business rule
- A Credit Note must always reference an existing Invoice (`invoiceId` is NOT NULL in schema) — never standalone. Only creatable against non-cancelled/returned invoices, capped at the invoice's remaining creditable amount, and (for "return" type) at each product's remaining un-returned invoiced quantity.
- **Why:** a credit note is a reversal document; without a linked invoice there's nothing to reverse, and the old optional-invoice model allowed orphaned/duplicate credits with no audit trail.
- Deleting an Invoice (directly, or cascaded from Order/Quotation deletion) must cascade-delete its Credit Notes first, reversing their stock/outstanding effects (`artifacts/api-server/src/lib/credit-notes.ts:cascadeDeleteCreditNotesForInvoice`) — run inside the same transaction as the invoice delete.
- Credit-note creation runs inside a transaction with `SELECT ... FOR UPDATE` on the invoice row, so concurrent creates against the same invoice can't jointly exceed its amount/quantity caps.
- Customer `outstanding` is always recomputed on read from invoices − payments − credit notes (see `computeOutstanding` in `customers.ts`), scoped to non-returned invoices; the `customersTable.outstanding` column itself is effectively unused/stale — don't trust it directly.
