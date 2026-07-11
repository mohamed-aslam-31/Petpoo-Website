---
name: Credit Limit Enforcement
description: How credit-limit checks behave across quotations/orders/invoices — informational, not blocking.
---

Credit-limit checks in quotations (single + bulk accept), order completion, and invoice
creation are **informational only** — they never block the action. `checkCreditLimit` still
runs and, when exceeded, the success response carries a `creditWarning` (single actions) or
`creditWarnings` (bulk quotation status) field built from `creditLimitErrorBody`. The frontend
shows this as a toast after the action completes, plus a live pre-submit `CreditLimitStatus`
preview panel in the relevant dialogs.

**Why:** product decision — customers should be able to exceed their credit limit (e.g. ₹10,000
limit, ₹20,000 order) with just a warning, not a hard stop. The old design required an
admin-override header/checkbox to bypass a 422; that flow (and the `CreditLimitWarning` component)
was removed entirely since nothing blocks anymore.

**How to apply:** if a new money-moving flow needs credit-limit awareness, follow this pattern —
compute the check, attach a warning field to the success response, never return 422/throw for it.
`creditLimit === 0` still means unlimited (no check needed).
