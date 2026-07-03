---
name: ShopFlow ERP stack
description: Key config for the ShopFlow ERP project — ports, workflows, patterns, and gotchas.
---

## Ports & Workflows
- Frontend: port 5173, workflow `artifacts/shopflow-erp: web`, cmd: `vite --config vite.config.ts --host 0.0.0.0`
- API server: port 8080, workflow `artifacts/api-server: API Server`, path prefix `/api`
- DATABASE_URL already set to `postgresql://postgres:password@helium/heliumdb?sslmode=disable`

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
