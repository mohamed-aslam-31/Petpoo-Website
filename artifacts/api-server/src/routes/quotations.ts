import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, or, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, quotationsTable, customersTable, ordersTable, invoicesTable, productsTable, stockMovementsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { cascadeDeleteCreditNotesForInvoice } from "../lib/credit-notes";

const router: IRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────
const ItemSchema = z.object({
  productId: z.number().int().optional(),
  productName: z.string().optional(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).optional().default(0),
  gstPercent: z.number().min(0).max(100).optional().default(0),
});

// Only draft and sent are allowed in create/edit; accepted happens via status change (auto-converts)
const EDITABLE_STATUSES = ["draft", "sent"] as const;
const ALL_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;

const CreateQuotationSchema = z.object({
  customerId: z.number().int().positive().optional().nullable(),
  isNewCustomer: z.boolean().optional().default(false),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerShopName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerLandline: z.string().optional(),
  customerShopType: z.string().optional(),
  customerGstAddress: z.string().optional(),
  customerCity: z.string().optional(),
  customerState: z.string().optional(),
  type: z.enum(["gst", "non_gst"]).default("gst"),
  date: z.string().min(1),
  transport: z.number().min(0).optional().default(0),
  packageCharge: z.number().min(0).optional().default(0),
  otherCharge: z.number().min(0).optional().default(0),
  items: z.array(ItemSchema).min(1, "At least one item required"),
  notes: z.string().optional(),
  status: z.enum(EDITABLE_STATUSES).optional().default("draft"),
}).refine(
  (d) => d.isNewCustomer || (d.customerId != null && d.customerId > 0),
  { message: "Either select an existing customer or provide new customer details", path: ["customerId"] }
);

const PatchQuotationSchema = z.object({
  customerId: z.number().int().positive().optional().nullable(),
  isNewCustomer: z.boolean().optional(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  customerShopName: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  customerLandline: z.string().optional().nullable(),
  customerShopType: z.string().optional().nullable(),
  customerGstAddress: z.string().optional().nullable(),
  customerCity: z.string().optional().nullable(),
  customerState: z.string().optional().nullable(),
  type: z.enum(["gst", "non_gst"]).optional(),
  date: z.string().optional(),
  transport: z.number().min(0).optional(),
  packageCharge: z.number().min(0).optional(),
  otherCharge: z.number().min(0).optional(),
  items: z.array(ItemSchema).optional(),
  notes: z.string().optional().nullable(),
  status: z.enum(ALL_STATUSES).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseNum(v: any) { return parseFloat(String(v ?? "0")); }

function calcTotals(items: any[], type: string, transport: number, packageCharge: number, otherCharge: number) {
  let subtotal = 0;
  let gstAmount = 0;
  const parsedItems = items.map((item) => {
    const base = item.quantity * item.unitPrice * (1 - (item.discount ?? 0) / 100);
    const gst = type === "gst" ? base * ((item.gstPercent ?? 0) / 100) : 0;
    subtotal += base;
    gstAmount += gst;
    return { ...item, lineTotal: base + gst };
  });
  const total = subtotal + gstAmount + transport + packageCharge + otherCharge;
  return { subtotal, gstAmount, total, parsedItems };
}

function generateQuotationNumber(id: number) {
  const year = new Date().getFullYear();
  return `QT${year}${String(id).padStart(5, "0")}`;
}

function parseQuotation(q: any, customerDbName?: string | null) {
  const items = Array.isArray(q.items) ? q.items : (typeof q.items === "string" ? JSON.parse(q.items) : []);
  const customerName = q.isNewCustomer ? (q.customerName ?? "") : (customerDbName ?? q.customerName ?? "");
  return {
    id: q.id,
    quotationNumber: q.quotationNumber,
    customerId: q.customerId ?? null,
    customerName,
    isNewCustomer: q.isNewCustomer,
    customerPhone: q.customerPhone ?? null,
    customerShopName: q.customerShopName ?? null,
    customerEmail: q.customerEmail ?? null,
    customerLandline: q.customerLandline ?? null,
    customerShopType: q.customerShopType ?? null,
    customerGstAddress: q.customerGstAddress ?? null,
    customerCity: q.customerCity ?? null,
    customerState: q.customerState ?? null,
    type: q.type,
    date: q.date,
    transport: parseNum(q.transport),
    packageCharge: parseNum(q.packageCharge),
    otherCharge: parseNum(q.otherCharge),
    subtotal: parseNum(q.subtotal),
    gstAmount: parseNum(q.gstAmount),
    total: parseNum(q.total),
    items,
    notes: q.notes ?? null,
    status: q.status,
    convertedOrderId: q.convertedOrderId ?? null,
    convertedOrderNumber: q.convertedOrderNumber ?? null,
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
  };
}

async function adjustStockForOrder(
  productId: number,
  type: "increase" | "decrease",
  quantity: number,
  reason: string,
  tx?: any,
) {
  const dbOrTx = tx ?? db;
  const [product] = await dbOrTx.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product || quantity <= 0) return;
  const beforeStock = product.currentStock;
  const afterStock = type === "increase" ? beforeStock + quantity : Math.max(0, beforeStock - quantity);
  await dbOrTx.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, productId));
  await dbOrTx.insert(stockMovementsTable).values({
    productId, type, quantity, beforeStock, afterStock, reason, notes: null,
  } as any);
}

/**
 * Core conversion logic — idempotent.
 * If quotation already has a convertedOrderId, returns existing linkage immediately.
 * Otherwise creates the order, stores the link, and deducts stock.
 */
async function doConvertToOrder(quotationId: number): Promise<{ orderId: number; orderNumber: string; customerId: number; customerName: string }> {
  const [row] = await db
    .select({ q: quotationsTable, customerDbName: customersTable.name })
    .from(quotationsTable)
    .leftJoin(customersTable, eq(customersTable.id, quotationsTable.customerId as any))
    .where(eq(quotationsTable.id, quotationId));

  if (!row) throw new Error("Quotation not found");
  const q = row.q;

  // Idempotency guard: already converted → return stored linkage
  if ((q as any).convertedOrderId) {
    return {
      orderId: (q as any).convertedOrderId,
      orderNumber: (q as any).convertedOrderNumber ?? `ORD${String((q as any).convertedOrderId).padStart(6, "0")}`,
      customerId: q.customerId ?? 0,
      customerName: row.customerDbName ?? q.customerName ?? "",
    };
  }

  // Resolve / create customer
  let customerId: number;
  let customerName: string;

  if (q.isNewCustomer) {
    const [tempCust] = await db.insert(customersTable).values({
      customerCode: "TEMP",
      name: q.customerName ?? "Unknown",
      phone: q.customerPhone ?? "",
      email: q.customerEmail ?? null,
      shopName: q.customerShopName ?? null,
      landlineNumber: q.customerLandline ?? null,
      address: q.customerGstAddress ?? null,
      city: q.customerCity ?? null,
      state: q.customerState ?? null,
      type: (q.customerShopType as any) ?? "retail",
      status: "active",
    } as any).returning();

    const custCode = `CUST${String(tempCust.id).padStart(4, "0")}`;
    const [cust] = await db.update(customersTable)
      .set({ customerCode: custCode })
      .where(eq(customersTable.id, tempCust.id))
      .returning();
    customerId = cust.id;
    customerName = cust.name;

    // Link quotation to the newly created customer, mark no longer "new"
    await db.update(quotationsTable)
      .set({ customerId, isNewCustomer: false })
      .where(eq(quotationsTable.id, quotationId));
  } else {
    if (!q.customerId) throw new Error("Quotation has no linked customer");
    customerId = q.customerId;
    customerName = row.customerDbName ?? "";
  }

  // Map quotation items → order items, preserving all pricing fields
  const qItems: any[] = Array.isArray(q.items) ? q.items : (typeof q.items === "string" ? JSON.parse(q.items) : []);
  const orderItems = qItems
    .filter((item: any) => item.productId)
    .map((item: any) => ({
      productId: item.productId,
      productName: item.productName ?? "Unknown",
      sku: item.sku ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount ?? 0,
      gstPercent: item.gstPercent ?? 0,
    }));

  if (orderItems.length === 0) throw new Error("No items with products found to create an order");

  // Quotation-level meta: carried to order so Complete Order dialog can pre-fill
  const quotationMeta = {
    type: q.type,
    transport: parseNum(q.transport),
    packageCharge: parseNum(q.packageCharge),
    otherCharge: parseNum(q.otherCharge),
    quotationNumber: q.quotationNumber,
  };

  const [tempOrder] = await db.insert(ordersTable).values({
    orderNumber: "TEMP",
    customerId,
    orderDate: q.date,
    notes: q.notes ? `From Quotation ${q.quotationNumber}. ${q.notes}` : `From Quotation ${q.quotationNumber}`,
    items: orderItems,
    meta: quotationMeta,
    createdFrom: "quotation",
    quotationId,
  } as any).returning();

  const orderNumber = `ORD${String(tempOrder.id).padStart(6, "0")}`;
  const [order] = await db.update(ordersTable)
    .set({ orderNumber })
    .where(eq(ordersTable.id, tempOrder.id))
    .returning();

  // Persist the order linkage on the quotation (enables idempotency + list display)
  await db.update(quotationsTable)
    .set({ convertedOrderId: order.id, convertedOrderNumber: orderNumber } as any)
    .where(eq(quotationsTable.id, quotationId));

  // Deduct stock
  for (const item of orderItems) {
    if (item.productId && item.quantity > 0) {
      await adjustStockForOrder(item.productId, "decrease", item.quantity, `Order ${orderNumber} (Quotation ${q.quotationNumber})`);
    }
  }

  await logAudit({ entityType: "order", entityId: order.id, entityNumber: orderNumber, action: "created", newStatus: "pending", notes: `Auto-created from quotation ${q.quotationNumber}` });

  return { orderId: order.id, orderNumber: order.orderNumber, customerId, customerName };
}

/**
 * Cascade-delete the order (and its invoice, if any) that was auto-created from a
 * quotation, restoring stock along the way. Used when a quotation's status changes
 * away from "accepted", or when the quotation itself is deleted.
 * Also clears convertedOrderId / convertedOrderNumber on the quotation row so there
 * are no stale references after the order is gone.
 */
async function cascadeDeleteConvertedOrder(quotation: any, reason: string) {
  const orderId = quotation.convertedOrderId;
  if (!orderId) return;

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));

    if (!order) {
      // Order already gone — just wipe the stale link on the quotation.
      await tx.update(quotationsTable)
        .set({ convertedOrderId: null, convertedOrderNumber: null } as any)
        .where(eq(quotationsTable.id, quotation.id));
      return;
    }

    const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderId));
    if (invoice) {
      const invoiceItems = Array.isArray(invoice.items) ? invoice.items : (typeof invoice.items === "string" ? JSON.parse(invoice.items as string) : []);
      for (const item of invoiceItems) {
        if (item.productId && item.quantity > 0) {
          await adjustStockForOrder(item.productId, "increase", item.quantity, `Invoice ${invoice.invoiceNumber} - cascade delete (${reason})`, tx);
        }
      }
      // A credit note can only exist while its invoice does — unwind any first.
      await cascadeDeleteCreditNotesForInvoice(invoice.id, reason, tx);
      await tx.delete(invoicesTable).where(eq(invoicesTable.id, invoice.id));
      await logAudit({ entityType: "invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber, action: "cascaded_delete", oldStatus: invoice.status, notes: reason }, tx);
    } else if (order.status === "pending") {
      const orderItems = Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items as string) : []);
      for (const item of orderItems) {
        if (item.productId && item.quantity > 0) {
          await adjustStockForOrder(item.productId, "increase", item.quantity, `Order ${order.orderNumber} - cascade delete (${reason})`, tx);
        }
      }
    }

    await tx.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await logAudit({ entityType: "order", entityId: order.id, entityNumber: order.orderNumber, action: "cascaded_delete", oldStatus: order.status, notes: reason }, tx);

    // Clear the conversion link so the quotation has no stale order reference.
    await tx.update(quotationsTable)
      .set({ convertedOrderId: null, convertedOrderNumber: null } as any)
      .where(eq(quotationsTable.id, quotation.id));
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
// GET /quotations
router.get("/quotations", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions: any[] = [];
  if (status) conditions.push(eq(quotationsTable.status, status));
  if (type) conditions.push(eq(quotationsTable.type, type));
  if (dateFrom) conditions.push(gte(quotationsTable.createdAt, new Date(dateFrom)));
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(quotationsTable.createdAt, to));
  }
  if (search) {
    conditions.push(or(
      ilike(quotationsTable.quotationNumber, `%${search}%`),
      ilike(quotationsTable.customerName, `%${search}%`),
      ilike(customersTable.name, `%${search}%`),
    ) as any);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(quotationsTable)
    .leftJoin(customersTable, eq(customersTable.id, quotationsTable.customerId as any))
    .where(where);

  const rows = await db
    .select({ q: quotationsTable, customerDbName: customersTable.name })
    .from(quotationsTable)
    .leftJoin(customersTable, eq(customersTable.id, quotationsTable.customerId as any))
    .where(where)
    .orderBy(sql`${quotationsTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows.map((r) => parseQuotation(r.q, r.customerDbName)),
    total: countResult.count,
    page,
    limit,
  });
});

// POST /quotations
router.post("/quotations", async (req, res): Promise<void> => {
  const parsed = CreateQuotationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;

  if (!data.isNewCustomer && data.customerId) {
    const [cust] = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, data.customerId));
    if (!cust) { res.status(404).json({ error: "Customer not found" }); return; }
  }

  const transport = data.transport ?? 0;
  const packageCharge = data.packageCharge ?? 0;
  const otherCharge = data.otherCharge ?? 0;
  const { subtotal, gstAmount, total, parsedItems } = calcTotals(data.items as any[], data.type, transport, packageCharge, otherCharge);

  const [temp] = await db.insert(quotationsTable).values({
    quotationNumber: "TEMP",
    customerId: data.customerId ?? null,
    isNewCustomer: data.isNewCustomer ?? false,
    customerName: data.customerName ?? null,
    customerPhone: data.customerPhone ?? null,
    customerShopName: data.customerShopName ?? null,
    customerEmail: data.customerEmail ?? null,
    customerLandline: data.customerLandline ?? null,
    customerShopType: data.customerShopType ?? null,
    customerGstAddress: data.customerGstAddress ?? null,
    customerCity: data.customerCity ?? null,
    customerState: data.customerState ?? null,
    type: data.type,
    date: data.date,
    transport: String(transport),
    packageCharge: String(packageCharge),
    otherCharge: String(otherCharge),
    subtotal: String(subtotal),
    gstAmount: String(gstAmount),
    total: String(total),
    items: parsedItems as any,
    notes: data.notes ?? null,
    status: data.status ?? "draft",
  } as any).returning();

  const quotationNumber = generateQuotationNumber(temp.id);
  const [quotation] = await db.update(quotationsTable).set({ quotationNumber }).where(eq(quotationsTable.id, temp.id)).returning();

  let customerDbName: string | null = null;
  if (!data.isNewCustomer && data.customerId) {
    const [cust] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, data.customerId));
    customerDbName = cust?.name ?? null;
  }

  res.status(201).json(parseQuotation(quotation, customerDbName));
});

// POST /quotations/bulk-delete  (must be before /:id routes)
router.post("/quotations/bulk-delete", async (req, res): Promise<void> => {
  const schema = z.object({ ids: z.array(z.number().int().positive()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "ids must be a non-empty array of integers" }); return; }

  // Fetch all quotations first so we can cascade-delete any linked orders/invoices.
  const quotations = await db.select().from(quotationsTable).where(inArray(quotationsTable.id, parsed.data.ids));
  for (const q of quotations) {
    if ((q as any).convertedOrderId) {
      await cascadeDeleteConvertedOrder(q, `Quotation ${q.quotationNumber} was bulk-deleted`);
    }
  }

  const deleted = await db.delete(quotationsTable)
    .where(inArray(quotationsTable.id, parsed.data.ids))
    .returning({ id: quotationsTable.id });

  res.json({ deleted: deleted.length });
});

// PATCH /quotations/bulk-status  (must be before /:id routes)
router.patch("/quotations/bulk-status", async (req, res): Promise<void> => {
  const schema = z.object({
    ids: z.array(z.number().int().positive()).min(1),
    status: z.enum(ALL_STATUSES),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { ids, status } = parsed.data;

  let ordersCreated = 0;
  const conversionErrors: string[] = [];

  if (status === "accepted") {
    // Update status first, then trigger order creation (doConvertToOrder is idempotent).
    const updated = await db.update(quotationsTable)
      .set({ status })
      .where(inArray(quotationsTable.id, ids))
      .returning({ id: quotationsTable.id });

    for (const row of updated) {
      try {
        await doConvertToOrder(row.id);
        ordersCreated++;
      } catch (err: any) {
        conversionErrors.push(`ID ${row.id}: ${err.message}`);
      }
    }

    res.json({ updated: updated.length, ordersCreated, conversionErrors });
  } else {
    // Cascade-delete any linked orders BEFORE changing status so that a cascade
    // failure leaves the quotation in a consistent "accepted" state (no status drift).
    const toDeconvert = await db.select()
      .from(quotationsTable)
      .where(and(inArray(quotationsTable.id, ids), eq(quotationsTable.status, "accepted")));

    // Track IDs whose cascade failed so we can exclude them from the status update.
    // A failed cascade means the linked order/invoice is still alive — updating the
    // quotation status anyway would create an orphan + status drift.
    const failedCascadeIds = new Set<number>();
    for (const q of toDeconvert) {
      if ((q as any).convertedOrderId) {
        try {
          await cascadeDeleteConvertedOrder(q, `Quotation ${q.quotationNumber} bulk-status changed to ${status}`);
        } catch (err: any) {
          conversionErrors.push(`ID ${q.id}: ${err.message}`);
          failedCascadeIds.add(q.id);
        }
      }
    }

    const safeIds = ids.filter(id => !failedCascadeIds.has(id));
    const updated = safeIds.length > 0
      ? await db.update(quotationsTable)
          .set({ status })
          .where(inArray(quotationsTable.id, safeIds))
          .returning({ id: quotationsTable.id })
      : [];

    res.json({ updated: updated.length, ordersCreated, conversionErrors });
  }
});

// GET /quotations/:id
router.get("/quotations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ q: quotationsTable, customerDbName: customersTable.name })
    .from(quotationsTable)
    .leftJoin(customersTable, eq(customersTable.id, quotationsTable.customerId as any))
    .where(eq(quotationsTable.id, id));

  if (!row) { res.status(404).json({ error: "Quotation not found" }); return; }
  res.json(parseQuotation(row.q, row.customerDbName));
});

// PATCH /quotations/:id
router.patch("/quotations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = PatchQuotationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;

  if (data.customerId != null && !(data.isNewCustomer)) {
    const [cust] = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, data.customerId));
    if (!cust) { res.status(404).json({ error: "Customer not found" }); return; }
  }

  const updates: any = {};
  const strFields = ["customerName", "customerPhone", "customerShopName", "customerEmail", "customerLandline", "customerShopType", "customerGstAddress", "customerCity", "customerState", "notes", "date"] as const;
  for (const f of strFields) {
    if (f in data) updates[f] = (data as any)[f] ?? null;
  }
  if ("customerId" in data) updates.customerId = data.customerId ?? null;
  if ("isNewCustomer" in data) updates.isNewCustomer = data.isNewCustomer;
  if ("status" in data) updates.status = data.status;

  if (data.items && data.items.length > 0) {
    const type = data.type ?? "gst";
    const transport = parseNum(data.transport ?? 0);
    const packageCharge = parseNum(data.packageCharge ?? 0);
    const otherCharge = parseNum(data.otherCharge ?? 0);
    const { subtotal, gstAmount, total, parsedItems } = calcTotals(data.items as any[], type, transport, packageCharge, otherCharge);
    Object.assign(updates, {
      type,
      items: parsedItems,
      transport: String(transport),
      packageCharge: String(packageCharge),
      otherCharge: String(otherCharge),
      subtotal: String(subtotal),
      gstAmount: String(gstAmount),
      total: String(total),
    });
  } else {
    if ("type" in data) updates.type = data.type;
    if ("transport" in data) updates.transport = String(parseNum(data.transport));
    if ("packageCharge" in data) updates.packageCharge = String(parseNum(data.packageCharge));
    if ("otherCharge" in data) updates.otherCharge = String(parseNum(data.otherCharge));
  }

  const [existingBefore] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existingBefore) { res.status(404).json({ error: "Quotation not found" }); return; }

  const isMovingAwayFromAccepted =
    "status" in data &&
    data.status !== "accepted" &&
    existingBefore.status === "accepted" &&
    !!(existingBefore as any).convertedOrderId;

  // Cascade-delete the linked order BEFORE updating status so that a cascade failure
  // leaves the quotation in a consistent "accepted" state (no status drift without cleanup).
  if (isMovingAwayFromAccepted) {
    await cascadeDeleteConvertedOrder(
      existingBefore,
      `Quotation ${existingBefore.quotationNumber} status changed to ${data.status}`,
    );
    // cascadeDeleteConvertedOrder already cleared convertedOrderId/Number; make sure
    // the main update doesn't accidentally re-set them to stale values.
    delete (updates as any).convertedOrderId;
    delete (updates as any).convertedOrderNumber;
  }

  const [quotation] = await db.update(quotationsTable).set(updates).where(eq(quotationsTable.id, id)).returning();
  if (!quotation) { res.status(404).json({ error: "Quotation not found" }); return; }

  if ("status" in data && data.status !== existingBefore.status) {
    await logAudit({ entityType: "quotation", entityId: quotation.id, entityNumber: quotation.quotationNumber, action: "status_changed", oldStatus: existingBefore.status, newStatus: data.status });
  }

  let customerDbName: string | null = null;
  if (!quotation.isNewCustomer && quotation.customerId) {
    const [cust] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, quotation.customerId));
    customerDbName = cust?.name ?? null;
  }

  // Auto-convert to order if status just became "accepted" (doConvertToOrder is idempotent)
  if (data.status === "accepted") {
    try {
      await doConvertToOrder(id);
    } catch (err: any) {
      // Status is already saved as accepted; log but don't fail the PATCH
      console.error(`Auto-convert failed for quotation ${id}:`, err.message);
    }
  }

  // Always re-fetch so the response reflects the latest convertedOrderId/Number state.
  const [refreshed] = await db
    .select({ q: quotationsTable, customerDbName: customersTable.name })
    .from(quotationsTable)
    .leftJoin(customersTable, eq(customersTable.id, quotationsTable.customerId as any))
    .where(eq(quotationsTable.id, id));
  res.json(parseQuotation(refreshed?.q ?? quotation, refreshed?.customerDbName ?? customerDbName));
});

// DELETE /quotations/:id
router.delete("/quotations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }

  if (existing.convertedOrderId) {
    await cascadeDeleteConvertedOrder(existing, `Quotation ${existing.quotationNumber} was deleted`);
  }

  const [q] = await db.delete(quotationsTable).where(eq(quotationsTable.id, id)).returning();
  if (!q) { res.status(404).json({ error: "Quotation not found" }); return; }

  await logAudit({ entityType: "quotation", entityId: q.id, entityNumber: q.quotationNumber, action: "deleted", oldStatus: q.status });

  res.sendStatus(204);
});

export default router;
