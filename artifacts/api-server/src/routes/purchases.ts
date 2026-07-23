import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  purchasesTable,
  suppliersTable,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";

const router: IRouter = Router();

function generatePurchaseNumber(id: number) {
  return `ACTP-${String(id).padStart(6, "0")}`;
}

function parsePurchase(p: any, supplierName?: string) {
  const items = Array.isArray(p.items)
    ? p.items
    : typeof p.items === "string"
      ? JSON.parse(p.items)
      : [];
  return {
    id: p.id,
    purchaseNumber: p.purchaseNumber,
    supplierId: p.supplierId,
    supplierName: supplierName ?? p.supplierName ?? "",
    purchaseDate: p.purchaseDate,
    items,
    packingCharges: parseFloat(p.packingCharges ?? "0"),
    transportCharges: parseFloat(p.transportCharges ?? "0"),
    loadingCharges: parseFloat(p.loadingCharges ?? "0"),
    otherCharges: parseFloat(p.otherCharges ?? "0"),
    discount: parseFloat(p.discount ?? "0"),
    subtotal: parseFloat(p.subtotal ?? "0"),
    gstTotal: parseFloat(p.gstTotal ?? "0"),
    grandTotal: parseFloat(p.grandTotal ?? "0"),
    notes: p.notes ?? null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

const PurchaseItemSchema = z.object({
  productId: z.number().int().positive("Product required"),
  productName: z.string().optional(),
  sku: z.string().optional(),
  brandId: z.number().int().nullable().optional(),
  brandName: z.string().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  currentStock: z.number().optional(),
  quantity: z.number().int().positive("Quantity must be > 0"),
  unit: z.string().optional(),
  purchasePrice: z.number().nonnegative("Price must be ≥ 0"),
  gstPercent: z.number().nonnegative().optional(),
  lineTotal: z.number().optional(),
  gstAmount: z.number().optional(),
});

const CreatePurchaseSchema = z.object({
  supplierId: z.number().int().positive("Supplier required"),
  purchaseDate: z.string().min(1, "Date required"),
  items: z.array(PurchaseItemSchema).min(1, "At least one item required"),
  packingCharges: z.number().nonnegative().optional().default(0),
  transportCharges: z.number().nonnegative().optional().default(0),
  loadingCharges: z.number().nonnegative().optional().default(0),
  otherCharges: z.number().nonnegative().optional().default(0),
  discount: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
});

router.get("/purchases", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  const conditions = search
    ? [ilike(purchasesTable.purchaseNumber, `%${search}%`)]
    : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(purchasesTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchasesTable.supplierId))
    .where(where);

  const rows = await db
    .select({
      purchase: purchasesTable,
      supplierName: suppliersTable.name,
    })
    .from(purchasesTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchasesTable.supplierId))
    .where(where)
    .orderBy(desc(purchasesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows.map((r) => parsePurchase(r.purchase, r.supplierName ?? "")),
    total: countResult.count,
    page,
    limit,
  });
});

router.post("/purchases", async (req, res): Promise<void> => {
  const parsed = CreatePurchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    supplierId,
    purchaseDate,
    items,
    packingCharges = 0,
    transportCharges = 0,
    loadingCharges = 0,
    otherCharges = 0,
    discount = 0,
    notes,
  } = parsed.data;

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.id, supplierId));
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  // Enrich items with product details and calculate totals
  const enrichedItems: any[] = [];
  let subtotal = 0;
  let gstTotal = 0;

  for (const item of items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(404).json({ error: `Product ${item.productId} not found` });
      return;
    }

    const lineTotal = item.quantity * item.purchasePrice;
    const gstPct = item.gstPercent ?? parseFloat(String(product.gstPercent)) ?? 0;
    const gstAmt = lineTotal * (gstPct / 100);

    subtotal += lineTotal;
    gstTotal += gstAmt;

    enrichedItems.push({
      productId: item.productId,
      productName: product.name,
      sku: product.sku,
      brandId: product.brandId ?? null,
      brandName: item.brandName ?? null,
      categoryId: product.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      currentStock: product.currentStock,
      quantity: item.quantity,
      unit: product.unit,
      purchasePrice: item.purchasePrice,
      gstPercent: gstPct,
      lineTotal,
      gstAmount: gstAmt,
    });
  }

  const additionalCharges =
    packingCharges + transportCharges + loadingCharges + otherCharges;
  const grandTotal = subtotal + gstTotal + additionalCharges - discount;

  // Insert purchase with TEMP number then update with real number
  const [temp] = await db
    .insert(purchasesTable)
    .values({
      purchaseNumber: "TEMP",
      supplierId,
      purchaseDate,
      items: enrichedItems,
      packingCharges: String(packingCharges),
      transportCharges: String(transportCharges),
      loadingCharges: String(loadingCharges),
      otherCharges: String(otherCharges),
      discount: String(discount),
      subtotal: String(subtotal),
      gstTotal: String(gstTotal),
      grandTotal: String(grandTotal),
      notes: notes ?? null,
    } as any)
    .returning();

  const purchaseNumber = generatePurchaseNumber(temp.id);
  const [purchase] = await db
    .update(purchasesTable)
    .set({ purchaseNumber })
    .where(eq(purchasesTable.id, temp.id))
    .returning();

  // Increase stock and record movements for each item
  for (const item of enrichedItems) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product || item.quantity <= 0) continue;

    const beforeStock = product.currentStock;
    const afterStock = beforeStock + item.quantity;

    await db
      .update(productsTable)
      .set({ currentStock: afterStock })
      .where(eq(productsTable.id, item.productId));

    await db.insert(stockMovementsTable).values({
      productId: item.productId,
      type: "increase",
      quantity: item.quantity,
      beforeStock,
      afterStock,
      reason: `Purchase`,
      notes: `${purchaseNumber} | Supplier: ${supplier.name} | Date: ${purchaseDate}`,
    } as any);
  }

  res.status(201).json(parsePurchase(purchase, supplier.name));
});

router.get("/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select({ purchase: purchasesTable, supplierName: suppliersTable.name })
    .from(purchasesTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchasesTable.supplierId))
    .where(eq(purchasesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Purchase not found" });
    return;
  }

  res.json(parsePurchase(row.purchase, row.supplierName ?? ""));
});

router.delete("/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Purchase not found" });
    return;
  }

  // Reverse stock for each item
  const items = Array.isArray(existing.items)
    ? existing.items
    : typeof existing.items === "string"
      ? JSON.parse(existing.items as any)
      : [];

  for (const item of items) {
    if (!item.productId || item.quantity <= 0) continue;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product) continue;

    const beforeStock = product.currentStock;
    const afterStock = Math.max(0, beforeStock - item.quantity);

    await db
      .update(productsTable)
      .set({ currentStock: afterStock })
      .where(eq(productsTable.id, item.productId));

    await db.insert(stockMovementsTable).values({
      productId: item.productId,
      type: "decrease",
      quantity: item.quantity,
      beforeStock,
      afterStock,
      reason: `Purchase Reversed`,
      notes: `${existing.purchaseNumber} deleted`,
    } as any);
  }

  await db.delete(purchasesTable).where(eq(purchasesTable.id, id));
  res.sendStatus(204);
});

export default router;
