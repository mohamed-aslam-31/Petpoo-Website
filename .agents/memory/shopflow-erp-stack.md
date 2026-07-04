---
name: ShopFlow ERP stack
description: Key stack decisions, port, workflow, and API patterns for this project.
---

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
