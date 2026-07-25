---
name: Purchase exit drafts
description: Why unsaved purchase bills use a browser draft until persistent purchase statuses exist.
---

## Rule
Unsaved New Purchase data is stored as one browser-local draft (`shopflow_purchase_draft`) via three paths: "Move to Draft" exit dialog, "Save as Draft" toolbar button, or on-form navigation guard. The draft object shape is `{ values: FormValues & { supplierName: string }, withGST: boolean }`.

The Purchases list reads the draft from localStorage on mount and renders it as the first row in the table (amber-tinted, DRAFT badge). "Continue" resumes it; the trash icon confirms-then-discards it. "New Purchase" always clears the draft first so the form opens blank.

**Why:** The purchases table has no status/draft endpoint, so saving through the live create endpoint would incorrectly update stock. Supplier name is embedded in the draft object so the list row can display it without an extra API call.

**How to apply:** If persistent draft management is added later, introduce an explicit purchase draft status and separate draft create/update flow before replacing the browser-local fallback. `PURCHASE_DRAFT_KEY` is exported from `purchases.tsx` (imported by nothing else currently).