---
name: Purchase exit drafts
description: Why unsaved purchase bills use a browser draft until persistent purchase statuses exist.
---

## Rule
Unsaved New Purchase data is stored as one browser-local draft when the user chooses “Move to Draft”. Saving the purchase or choosing “Cancel Purchase” removes it.

**Why:** The purchases table currently has no status or draft endpoint, so writing a draft through the live purchase-create endpoint would incorrectly increase stock and create a completed purchase.

**How to apply:** If persistent draft management is added later, introduce an explicit purchase draft status and separate draft create/update flow before replacing the browser-local fallback.