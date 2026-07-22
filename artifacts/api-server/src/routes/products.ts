import { Router, type IRouter } from "express";
import { eq, ilike, and, or, lte, sql, ne, isNull } from "drizzle-orm";
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

router.get("/products", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const categoryId = req.query.categoryId ? parseInt(String(req.query.categoryId), 10) : undefined;
  const brandId = req.query.brandId ? parseInt(String(req.query.brandId), 10) : undefined;
  const lowStock = req.query.lowStock === "true";

  const conditions = [];
  if (search) conditions.push(or(
    ilike(productsTable.name, `%${search}%`),
    ilike(productsTable.sku, `%${search}%`),
    ilike(productsTable.hsnCode, `%${search}%`),
    ilike(productsTable.barcode, `%${search}%`),
  ));
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
  if (brandId) conditions.push(eq(productsTable.brandId, brandId));
  if (lowStock) conditions.push(lte(productsTable.currentStock, productsTable.minStock));

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
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .where(where)
    .orderBy(productsTable.name)
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

  const { type, quantity, reason, notes } = parsed.data;
  const beforeStock = product.currentStock;
  let afterStock = beforeStock;

  if (type === "increase" || type === "return") {
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
    notes: notes ?? null,
  });

  res.json(parseProductRow(updated));
});

export default router;
