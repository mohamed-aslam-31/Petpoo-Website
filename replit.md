# ShopFlow ERP

A full-stack wholesale & retail ERP system for Indian merchants — inventory, billing, orders, customers, suppliers, employees, payments, expenses, and analytics in one place.

## Run & Operate

On Replit, use the managed artifact workflows — they handle port assignment automatically:
- **`artifacts/api-server: API Server`** — API server (port 8080, proxied at `/api`)
- **`artifacts/shopflow-erp: web`** — Frontend (port 5173 on Replit, proxied at `/`)

To run manually outside Replit:
- `PORT=8080 pnpm --filter @workspace/api-server run dev` — API server
- `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/shopflow-erp run dev` — Frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS + shadcn/ui + TanStack Query + Recharts + wouter
- API: Express 5 (port 8080, path prefix `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-zod/`, `lib/api-hooks/`)
- Build: esbuild (CJS bundle)
- Auth: localStorage-based (demo mode — any credentials work)

## Where things live

- `lib/db/src/schema/` — all 10 Drizzle table definitions (source of truth for DB shape)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-zod/` — generated Zod schemas (do not edit manually)
- `lib/api-hooks/` — generated TanStack Query hooks (do not edit manually)
- `artifacts/api-server/src/routes/` — one file per module (categories, brands, products, customers, suppliers, orders, invoices, payments, employees, expenses, stock, dashboard)
- `artifacts/shopflow-erp/src/pages/` — all frontend pages organized by module
- `artifacts/shopflow-erp/src/components/` — shared UI components + layout

## Architecture decisions

- Contract-first: OpenAPI spec → codegen → Zod validators on server + React Query hooks on client
- Numeric DB columns stored as Postgres `numeric`/`decimal` — always `parseFloat()` before sending JSON
- Order/invoice items stored as JSONB array — flexible line-item structure without a separate table
- Auto-generated codes (CUST0001, ORD000001, etc.) inserted as "TEMP" then updated in a second query after getting the auto-increment id
- Express 5 async handlers must type-annotate `Promise<void>` return to satisfy strict TS

## Product

- **Dashboard** — today's sales, stock value, low-stock alerts, charts (30-day sales trend, top products)
- **Inventory** — products with SKU/barcode/HSN/GST, categories, brands, stock adjustment log
- **Billing** — GST-compliant invoices (CGST/SGST/IGST), wholesale orders
- **Customers** — customer ledger with transaction history
- **Suppliers** — supplier accounts + outstanding tracking
- **Employees** — staff directory with roles, departments, salaries
- **Payments** — incoming/outgoing payment tracking
- **Expenses** — expense management by category
- **Reports** — sales analytics, profit & loss

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Never `pnpm dev` at workspace root — run via workflows or `pnpm --filter @workspace/<name> run dev`
- After schema changes: `pnpm --filter @workspace/db run push` then restart API workflow
- After OpenAPI spec changes: `pnpm --filter @workspace/api-spec run codegen` then restart API workflow
- Numeric DB fields (prices, amounts) come back as strings from Drizzle — always wrap in `parseFloat()`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
