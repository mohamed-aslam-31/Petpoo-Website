---
name: ShopFlow ERP stack
description: Key config for the ShopFlow ERP project — ports, workflows, patterns, and gotchas.
---

## Ports & Workflows
- Frontend: port 5000, workflow `artifacts/shopflow-erp: web`, cmd: `cd artifacts/shopflow-erp && PORT=5000 BASE_PATH=/ pnpm exec vite --config vite.config.ts --host 0.0.0.0`
- API server: port 8080, workflow `artifacts/api-server: API Server`, cmd: `cd artifacts/api-server && node ./build.mjs && PORT=8080 NODE_ENV=development node --enable-source-maps ./dist/index.mjs`
- DATABASE_URL is configured in environment secrets (do not store the value here)
- The bare `pnpm run dev` script for api-server (which chains `pnpm run build && pnpm run start` as nested npm-script processes) reliably fails Replit's workflow port-detection even though the server does bind and respond — nested pnpm/npm script process trees seem to break the port checker. Run the build+node command directly in the workflow instead (see cmd above). Same applies to frontend: `vite` isn't on bare PATH, must use `pnpm exec vite` with PORT/BASE_PATH exported inline, not via `pnpm --filter run dev`.

## API Pattern
- All generated hooks in `lib/api-client-react/src/generated/api.ts`
- All generated Zod types in `lib/api-zod/src/generated/types/`
- Query key functions: `getList{Entity}QueryKey(params?)` — pass params to the queryKey for cache scoping by page/search

## CRUD Pattern
- Form dialogs: `useForm` + `zodResolver` + `useCreateX`/`useUpdateX` hooks, invalidate queryKey on success
- Delete: `useDeleteX` + `AlertDialog` confirmation, invalidate queryKey on success
- Pagination: `page` state + `PAGE_SIZE=20`, pass `{ page, limit }` to list hooks

## Auth
- Demo mode: localStorage flag `shopflow_auth`, any credentials work

## Gotchas
- `numeric`/`decimal` DB columns come back as strings — always `parseFloat()` before JSON
- Order/invoice items in JSONB — use `items: OrderItemInput[]` shape
- Auto-generated codes (CUST0001, ORD000001) inserted as "TEMP" then updated after getting the auto-increment id
- Duplicate workflow instances (e.g. both `API Server` and `artifacts/api-server: API Server`) can leave a stale `node dist/index.mjs` process holding port 8080 after edits, causing EADDRINUSE on restart with the OLD compiled code still serving requests (stale schema/columns). Fix: `pgrep -af "dist/index.mjs"` and `kill -9` the stale pid(s) before restarting the workflow.
- Orders module: cancel/return endpoints are `PATCH /api/orders/:id/cancel` and `PATCH /api/orders/:id/return` (not POST).
