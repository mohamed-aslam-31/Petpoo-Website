---
name: Purchase item selection rules
description: Durable business rules for the Purchase Items selection workflow.
---

## Rule
Brand, category, product, and unit selectors are searchable and independently clearable. Selecting an existing product auto-fills its linked brand, category, unit, and previous purchase price; selecting brand or category alone must not constrain the other selectors or automatically choose a product. Clearing a product clears only the product and its product-derived details; it never clears Brand or Category.

**Why:** Purchase entry must support guided product lookup while preserving independent Brand and Category choices when users change or clear fields.

**How to apply:** Keep validation feedback deferred until Save is attempted. New brand/category/product/unit records may be staged inline; existing-product price changes require an explicit update-price choice.

Purchase line-item discounts are percentages from 0–100%; the separate purchase-level discount remains an amount.

**Why:** A line discount should scale with quantity and price, while the bill-level adjustment is a fixed final-bill amount.