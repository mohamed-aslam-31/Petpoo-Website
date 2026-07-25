---
name: Purchase item selection rules
description: Durable business rules for the Purchase Items selection workflow.
---

## Rule
Brand, category, product, and unit selectors are searchable and independently clearable. Selecting an existing product auto-fills its linked brand, category, unit, and previous purchase price; selecting brand or category alone must not constrain the other selectors or automatically choose a product. Clearing a product clears only the product and its product-derived details; it never clears Brand or Category.

**Why:** Purchase entry must support guided product lookup while preserving independent Brand and Category choices when users change or clear fields.

**How to apply:** Keep validation feedback deferred until Save is attempted. New brand/category/product/unit records may be staged inline; existing-product price changes require an explicit update-price choice.