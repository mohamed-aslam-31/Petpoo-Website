---
name: ShopFlow ERP stack
description: Key stack decisions, port, workflow, and API patterns for this project.
---

## Setup after import
- `pnpm install` at repo root installs the monorepo's node_modules (esbuild, vite, etc.) — a fresh import/clone won't have them yet, causing `ERR_MODULE_NOT_FOUND: esbuild` and `vite not found` on first workflow run.
- **Why:** node_modules is gitignored; imported repos ship code only.
- The API server workflow can report a false-positive port-open timeout on first boot (esbuild bundling + pino transports take a while) even though it ends up listening fine — check the tail of its log for "Server listening" before assuming it's broken.

- A fresh/re-imported DB has no tables until `pnpm --filter @workspace/db run push` is run explicitly — `setup.sh` does this, but if you skip it the API server boots fine yet every list endpoint 500s with a generic "Failed query" (no root cause logged). After pushing schema, restart the API server workflow — connections opened before the push can keep failing even after tables exist.

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

## Dwolla integration
- `artifacts/api-server/src/dwolla.ts` — client module, call `isDwollaConfigured()` before any API call
- Routes: `GET /customers/dwolla-status`, `POST /customers/:id/link-dwolla`, `GET /customers/:id/balance`
- All Dwolla routes return 503 when `DWOLLA_CLIENT_ID` or `DWOLLA_CLIENT_SECRET` are missing
- Frontend checks `useGetCustomerDwollaStatus()` to disable the Link button before the user clicks

## Port topology
- Fixed assignment: frontend (webview) MUST stay on port 5000, API server on 8080 (console) — the platform requires webview output type to use port 5000.
- **Why:** swapping them makes the preview pane show the API server (no UI, looks blank) since preview always points at port 5000.
- Vite's `/api` proxy target in `vite.config.ts` must match the API server's actual port whenever either port changes.

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

## Accounting ledger + Cancel Invoice
- `accounting_entries` table logs sales/receivable/refund effects: invoice creation posts sales+receivable "increase"; credit note creation posts the "decrease" reversal (+ refund "increase" for return/cancellation types). Entries are deleted (not reversed) when their source invoice/credit-note is deleted, so the ledger only ever reflects live documents — same pattern as stock movements.
- "Cancel Invoice" (`POST /invoices/:id/cancel`) auto-creates a full-reversal Credit Note (type `cancellation`) for whatever balance/items haven't already been credited, restores stock, marks the invoice `cancelled`, and keeps the invoice row for audit — never deletes it.
- **Why:** the ERP treats Delete as "never happened" (full cascade removal) vs. Cancel/Return as "happened then reversed" (row kept, reversal recorded) — mixing these up breaks the audit trail.
- **How to apply:** any new invoice/credit-note creation or deletion path must call the matching `recordInvoiceEntries`/`recordCreditNoteEntries`/`deleteAccountingEntriesFor` helper in `artifacts/api-server/src/lib/accounting.ts` to keep the ledger consistent.

## Category-Brand association pattern
- Categories carry two brand fields: `brand_id` (FK to brands, for existing brands) and `brand_name` (text, for "Other" custom names). Both are nullable; both null = "No Brand".
- API response `brandName` is the effective display name: `joinedBrandName ?? storedBrandName ?? null`. `brandId` is the raw FK.
- Frontend form uses a synthetic `brandSelection` field: `"no-brand"` | `"other"` | `"{brandId}"`. "Other" reveals a `customBrandName` text input.
- On submit: if `brandSelection` is a numeric string → set `brandId`, clear `brandName`. If `"other"` → clear `brandId`, set `brandName`. If `"no-brand"` → both null.
- The `description` column was removed from both `brands` and `categories` tables (ALTER TABLE … DROP COLUMN).
- **Why:** categories needed a brand association that supports existing brands, no brand, and custom one-off names without polluting the brands master list.

## Orval codegen naming collision
- If a new OpenAPI operation's auto-derived request/response type name (`<operationId>Body`/`<operationId>Response`) exactly matches the name of a `components.schemas.*` entry it references via `$ref`, orval's zod target generates two same-named exports (one in `generated/api.ts`, one in `generated/types/*.ts`) and `tsc` fails with "already exported a member" in `lib/api-zod/src/index.ts`.
- **Why:** zod config's `schemas: { type: "typescript" }` emits a standalone type file per named component schema, independent of the request/response name orval derives from the operationId.
- **How to apply:** name request/response component schemas differently from `<operationId>Body`/`<operationId>Response` (e.g. suffix `Request`/`Result` instead) to avoid the collision.
