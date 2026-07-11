---
name: Credit Limit Enforcement
description: How credit limit enforcement is implemented — backend checks, frontend override UX, and key design decisions.
---

## Architecture

### Backend (5 files changed)
- `artifacts/api-server/src/lib/credit-limit.ts` — shared lib: `computeOutstanding()`, `checkCreditLimit()`, `creditLimitErrorBody()`.
- `customers.ts` — removed local `computeOutstanding()`, imports from lib; adds `GET /customers/:id/credit-status` endpoint.
- `orders.ts` — `POST /orders/:id/complete` checks credit BEFORE inserting invoice rows.
- `invoices.ts` — `POST /invoices` checks credit BEFORE inserting.
- `quotations.ts` — `PATCH /quotations/:id` checks on status→accepted; `PATCH /quotations/bulk-status` pre-checks all before any commit.

### Frontend (9 files changed)
- `src/lib/auth.ts` — `getAuthData()`, `isAdmin()`, `setAuthData(email)`. Email with "admin" → admin role.
- `src/hooks/use-credit-status.ts` — TanStack Query hook for `/api/customers/:id/credit-status`.
- `src/components/credit-limit-status.tsx` — compact 4-metric display (Limit / Outstanding / Available / Status badge).
- `src/components/credit-limit-warning.tsx` — blocking red alert with all 5 figures + admin override checkbox.
- `login.tsx` — calls `setAuthData(email)` to persist role-aware auth.
- `customers/detail.tsx` — shows `CreditLimitStatus` panel below the 4-stat grid.
- `order-complete-dialog.tsx` — direct `useMutation + fetch` replacing generated hook; shows credit status + warning.
- `invoice-form-dialog.tsx` — same pattern for POST /invoices; shows credit status when customer selected.
- `billing/quotations.tsx` — `apiFetch` enhanced with extra headers + `.data` on errors; `useUpdateQuotation`/`useBulkStatus` support `override?: boolean`.

## Key Rules
- **creditLimit === 0 → unlimited.** Never enforce when limit is zero.
- **Hard block via HTTP 422** with body `{ error: "CREDIT_LIMIT_EXCEEDED", creditLimit, outstanding, availableCredit, newAmount, projectedOutstanding, excessAmount }`.
- **Admin override:** send `X-Admin-Override: true` header. Frontend passes it only when `isAdmin()` and user explicitly ticks the checkbox.
- **No real auth.** Role is derived from localStorage JSON `{ role, email }`. Admin = email contains "admin".
- **computeOutstanding filter:** `i.status !== "returned"` only — cancelled invoices remain in debits (their credit notes offset them). Do NOT add "cancelled" to the exclusion list.

**Why:**
- Hard-blocking at 422 prevents silent overcommitment of credit.
- Admin override at request-header level keeps the frontend in control without any server-side role check (demo mode).
- Shared `credit-limit.ts` lib ensures customers/orders/invoices/quotations all use identical outstanding calculation.
