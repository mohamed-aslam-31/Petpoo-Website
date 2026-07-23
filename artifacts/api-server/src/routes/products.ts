import { Router, type IRouter } from "express";
import { eq, ilike, and, or, lte, sql, ne, isNull, isNotNull, inArray, asc, desc } from "drizzle-orm";
import { db, productsTable, categoriesTable, brandsTable, stockMovementsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  AdjustStockParams,
  AdjustStockBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseProductRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? null,
    hsnCode: row.hsnCode ?? null,
    categoryId: row.categoryId ?? null,
    categoryName: row.categoryName ?? null,
    brandId: row.brandId ?? null,
    brandName: row.brandName ?? null,
    purchasePrice: parseFloat(row.purchasePrice ?? "0"),
    sellingPrice: parseFloat(row.sellingPrice ?? "0"),
    wholesalePrice: parseFloat(row.wholesalePrice ?? "0"),
    retailPrice: parseFloat(row.retailPrice ?? "0"),
    gstPercent: parseFloat(row.gstPercent ?? "0"),
    unit: row.unit,
    currentStock: row.currentStock,
    minStock: row.minStock,
    location: row.location ?? null,
    status: row.status,
    description: row.description ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

router.get("/products/next-sku", async (req, res): Promise<void> => {
  const [row] = await db
    .select({ sku: productsTable.sku })
    .from(productsTable)
    .where(sql`${productsTable.sku} ~ '^SKU-[0-9]+$'`)
    .orderBy(sql`cast(substring(${productsTable.sku} from 5) as integer) desc`)
    .limit(1);

  let next = 1;
  if (row) {
    const num = parseInt(row.sku.slice(4), 10);
    if (!isNaN(num)) next = num + 1;
  }

  const sku = `SKU-${String(next).padStart(3, "0")}`;
  res.json({ sku });
});

// Returns distinct units and locations for filter dropdowns
router.get("/products/options", async (_req, res): Promise<void> => {
  const [unitRows, locationRows] = await Promise.all([
    db.selectDistinct({ unit: productsTable.unit })
      .from(productsTable)
      .where(isNotNull(productsTable.unit))
      .orderBy(asc(productsTable.unit)),
    db.selectDistinct({ location: productsTable.location })
      .from(productsTable)
      .where(isNotNull(productsTable.location))
      .orderBy(asc(productsTable.location)),
  ]);
  res.json({
    units: unitRows.map(r => r.unit).filter(Boolean),
    locations: locationRows.map(r => r.location).filter(Boolean),
  });
});

router.get("/products", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const lowStock = req.query.lowStock === "true";

  // Multi-value filters (comma-separated)
  const categoryIds = req.query.categoryIds
    ? String(req.query.categoryIds).split(",").map(Number).filter(n => !isNaN(n) && n > 0)
    : [];
  const brandIds = req.query.brandIds
    ? String(req.query.brandIds).split(",").map(Number).filter(n => !isNaN(n) && n > 0)
    : [];
  const units = req.query.units
    ? String(req.query.units).split(",").filter(Boolean)
    : [];
  const locations = req.query.locations
    ? String(req.query.locations).split(",").filter(Boolean)
    : [];
  const minStock = req.query.minStock !== undefined ? Number(req.query.minStock) : undefined;
  const maxStock = req.query.maxStock !== undefined ? Number(req.query.maxStock) : undefined;
  const noBrand    = req.query.noBrand    === "true";
  const noCategory = req.query.noCategory === "true";

  // Sort
  const sortBy = req.query.sortBy as string | undefined;
  const sortOrder = req.query.sortOrder as string | undefined;
  const orderByClause =
    sortBy === "createdAt"
      ? sortOrder === "asc" ? asc(productsTable.createdAt) : desc(productsTable.createdAt)
      : sortBy === "currentStock"
        ? sortOrder === "desc" ? desc(productsTable.currentStock) : asc(productsTable.currentStock)
      : sortOrder === "desc" ? desc(productsTable.name) : asc(productsTable.name);

  const conditions = [];
  if (search) conditions.push(or(
    ilike(productsTable.name, `%${search}%`),
    ilike(productsTable.sku, `%${search}%`),
    ilike(productsTable.hsnCode, `%${search}%`),
    ilike(productsTable.barcode, `%${search}%`),
  ));
  // Category filter: support "no category" (null) alongside specific IDs
  if (categoryIds.length && noCategory) {
    conditions.push(or(isNull(productsTable.categoryId), inArray(productsTable.categoryId, categoryIds)));
  } else if (categoryIds.length) {
    conditions.push(inArray(productsTable.categoryId, categoryIds));
  } else if (noCategory) {
    conditions.push(isNull(productsTable.categoryId));
  }
  // Brand filter: support "no brand" (null) alongside specific IDs
  if (brandIds.length && noBrand) {
    conditions.push(or(isNull(productsTable.brandId), inArray(productsTable.brandId, brandIds)));
  } else if (brandIds.length) {
    conditions.push(inArray(productsTable.brandId, brandIds));
  } else if (noBrand) {
    conditions.push(isNull(productsTable.brandId));
  }
  if (units.length) conditions.push(inArray(productsTable.unit, units));
  if (locations.length) conditions.push(inArray(productsTable.location, locations));
  if (lowStock) conditions.push(lte(productsTable.currentStock, productsTable.minStock));
  if (minStock !== undefined && Number.isFinite(minStock)) conditions.push(sql`${productsTable.currentStock} >= ${minStock}`);
  if (maxStock !== undefined && Number.isFinite(maxStock)) conditions.push(sql`${productsTable.currentStock} <= ${maxStock}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(productsTable)
    .where(where);

  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      barcode: productsTable.barcode,
      hsnCode: productsTable.hsnCode,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      brandId: productsTable.brandId,
      brandName: brandsTable.name,
      purchasePrice: productsTable.purchasePrice,
      sellingPrice: productsTable.sellingPrice,
      wholesalePrice: productsTable.wholesalePrice,
      retailPrice: productsTable.retailPrice,
      gstPercent: productsTable.gstPercent,
      unit: productsTable.unit,
      currentStock: productsTable.currentStock,
      minStock: productsTable.minStock,
      location: productsTable.location,
      status: productsTable.status,
      description: productsTable.description,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .where(where)
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows.map(parseProductRow),
    total: countResult.count,
    page,
    limit,
  });
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data as any;

  // Duplicate barcode check
  if (data.barcode) {
    const [dup] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.barcode, data.barcode));
    if (dup) { res.status(409).json({ error: "A product with this barcode already exists" }); return; }
  }

  // Duplicate name within same brand + category
  const nameWhere = [ilike(productsTable.name, data.name.trim()),
    data.brandId    ? eq(productsTable.brandId, data.brandId)       : isNull(productsTable.brandId),
    data.categoryId ? eq(productsTable.categoryId, data.categoryId) : isNull(productsTable.categoryId),
  ];
  const [dupName] = await db.select({ id: productsTable.id }).from(productsTable).where(and(...nameWhere));
  if (dupName) { res.status(409).json({ error: "A product with this name already exists in the same brand/category" }); return; }

  const [product] = await db.insert(productsTable).values({ ...data, name: data.name.trim() }).returning();

  // Auto-create Opening Stock movement when product is created with stock > 0
  if (product.currentStock > 0) {
    await db.insert(stockMovementsTable).values({
      productId: product.id,
      type: "increase",
      quantity: product.currentStock,
      beforeStock: 0,
      afterStock: product.currentStock,
      reason: "Opening Stock Added",
      notes: null,
    });
  }

  res.status(201).json(parseProductRow(product));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      barcode: productsTable.barcode,
      hsnCode: productsTable.hsnCode,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      brandId: productsTable.brandId,
      brandName: brandsTable.name,
      purchasePrice: productsTable.purchasePrice,
      sellingPrice: productsTable.sellingPrice,
      wholesalePrice: productsTable.wholesalePrice,
      retailPrice: productsTable.retailPrice,
      gstPercent: productsTable.gstPercent,
      unit: productsTable.unit,
      currentStock: productsTable.currentStock,
      minStock: productsTable.minStock,
      location: productsTable.location,
      status: productsTable.status,
      description: productsTable.description,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .where(eq(productsTable.id, id));

  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(parseProductRow(row));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data as any;
  const selfId = params.data.id;

  // Duplicate barcode check (exclude self)
  if (data.barcode) {
    const [dup] = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.barcode, data.barcode), ne(productsTable.id, selfId)));
    if (dup) { res.status(409).json({ error: "A product with this barcode already exists" }); return; }
  }

  // Duplicate name within same brand + category (exclude self)
  if (data.name) {
    const [current] = await db.select().from(productsTable).where(eq(productsTable.id, selfId));
    if (current) {
      const effectiveBrandId    = data.brandId    !== undefined ? data.brandId    : current.brandId;
      const effectiveCategoryId = data.categoryId !== undefined ? data.categoryId : current.categoryId;
      const nameWhere = [ilike(productsTable.name, data.name.trim()), ne(productsTable.id, selfId),
        effectiveBrandId    ? eq(productsTable.brandId, effectiveBrandId)       : isNull(productsTable.brandId),
        effectiveCategoryId ? eq(productsTable.categoryId, effectiveCategoryId) : isNull(productsTable.categoryId),
      ];
      const [dupName] = await db.select({ id: productsTable.id }).from(productsTable).where(and(...nameWhere));
      if (dupName) { res.status(409).json({ error: "A product with this name already exists in the same brand/category" }); return; }
    }
  }

  const updateData = data.name ? { ...data, name: data.name.trim() } : data;
  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, selfId)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(parseProductRow(product));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Check stock before deleting
  const [existing] = await db
    .select({ id: productsTable.id, name: productsTable.name, currentStock: productsTable.currentStock })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  if (existing.currentStock > 0) {
    res.status(409).json({
      error: `"${existing.name}" has ${existing.currentStock} unit(s) in stock. Adjust stock to 0 before deleting.`,
      currentStock: existing.currentStock,
    });
    return;
  }

  // Delete related stock movements first (no CASCADE on FK)
  await db.delete(stockMovementsTable).where(eq(stockMovementsTable.productId, params.data.id));

  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.sendStatus(204);
});

router.patch("/products/:id/stock", async (req, res): Promise<void> => {
  const params = AdjustStockParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AdjustStockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const { type, quantity, reason } = parsed.data;
  const beforeStock = product.currentStock;
  let afterStock = beforeStock;

  if (type === "increase") {
    afterStock = beforeStock + quantity;
  } else {
    afterStock = Math.max(0, beforeStock - quantity);
  }

  const [updated] = await db
    .update(productsTable)
    .set({ currentStock: afterStock })
    .where(eq(productsTable.id, params.data.id))
    .returning();

  await db.insert(stockMovementsTable).values({
    productId: params.data.id,
    type,
    quantity,
    beforeStock,
    afterStock,
    reason,
    notes: null,
  });

  res.json(parseProductRow(updated));
});

export default router;
