---
    name: Brands/Categories API shape
    description: useListBrands and useListCategories return plain arrays, not paginated objects.
    ---

    # Brands/Categories API shape

    ## Rule
    `useListBrands()` and `useListCategories()` take **no parameters** and return `Brand[]` / `Category[]` directly — not a paginated wrapper.

    `useListProducts()` and `useListSuppliers()` return paginated objects (`{ data: T[], total, page, limit }`).

    **Why:** The OpenAPI spec for brands/categories uses a plain array response, while products/suppliers use a `*Page` schema.

    **How to apply:** When destructuring these hooks, use `const { data: brandsData } = useListBrands(); const allBrands = brandsData ?? [];` — never `brandsData?.data`.
    