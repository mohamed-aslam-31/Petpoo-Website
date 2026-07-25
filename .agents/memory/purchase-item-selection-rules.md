---
name: Purchase item selection rules
description: Durable business rules for the Purchase Items selection workflow.
---

## Rule
Brand, category, product, and unit selectors are searchable and independently clearable. Selecting an existing product auto-fills its linked brand, category, unit, and previous purchase price; selecting brand or category alone must not constrain the other selectors or automatically choose a product. Clearing a product only clears brand/category values that were auto-filled by that product, not manually entered values.

**Why:** Purchase entry must support both guided entry from an existing product and flexible entry for new or manually described products without destroying user input.

**How to apply:** Keep validation feedback deferred until Save is attempted. New brand/category/product/unit records may be staged inline; existing-product price changes require an explicit update-price choice.