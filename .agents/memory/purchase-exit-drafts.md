---
name: Purchase exit drafts
description: Why unsaved purchase bills use a browser draft until persistent purchase statuses exist.
---

## Rule
Multiple purchase drafts are stored in `localStorage` under `shopflow_purchase_drafts` (an array of `PurchaseDraft`). Shared utility lives at `lib/purchase-drafts.ts` — use `readDrafts`, `upsertDraft`, `removeDraft` from there; do not read/write the key directly in components.

Each `PurchaseDraft` has `{ id, supplierName, purchaseDate, itemCount, savedAt, values, withGST }`. The `id` is a `Date.now()` timestamp string generated on first save.

The form detects its draft via `?draft=<id>` in the URL. `?new=1` skips restoration entirely (used by "New Purchase" button). Drafts appear as amber-tinted rows at the top of the Purchases table; "Continue" links to `?draft=<id>`; trash triggers a confirm dialog per-draft.

**Why:** Multiple users can start separate purchases and save each as a draft without overwriting others. No DB draft endpoint exists, so browser-local storage is the only safe option (avoids incorrect stock updates).

**How to apply:** If a persistent draft API is added later, map `PurchaseDraft.id` to a server-side draft id and replace the localStorage calls in `lib/purchase-drafts.ts` — the component interfaces stay unchanged.