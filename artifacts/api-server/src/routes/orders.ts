import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, gte, lte, or } from "drizzle-orm";
import { db, ordersTable, invoicesTable, customersTable, productsTable, stockMovementsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  DeleteOrderParams,
  CompleteOrderParams,
  CompleteOrderBody,
  CancelOrderParams,
  ReturnOrderParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseOrder(o: any, customerName?: string, invoiceNumber?: string | null) {
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === "string" ? JSON.parse(o.items) : []);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: customerName ?? o.customerName ?? "",
    status: o.status,
    orderDate: o.orderDate,
    invoiceId: o.invoiceId ?? null,
    invoiceNumber: invoiceNumber ?? null,
    notes: o.notes ?? null,
    items,
    /** Quotation-level charges/type so CompleteOrder dialog can pre-fill */
    meta: o.meta ?? null,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
  };
}

function generateOrderNumber(id: number) {
  return `ORD${String(id).padStart(6, "0")}`;
}

function generateInvoiceNumber(id: number) {
  const year = new Date().getFullYear();
  return `INV${year}${String(id).padStart(5, "0")}`;
}

async function enrichItemNames(items: any[]) {
  const result = [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    result.push({
      productId: item.productId,
      productName: product?.name ?? "Unknown",
      sku: product?.sku ?? "",
      quantity: item.quantity,
    });
  }
  return result;
}

/** Adjust a single product's stock and record a movement */
async function adjustStock(
  productId: number,
  type: "increase" | "decrease" | "damage" | "lost" | "return",
  quantity: number,
  reason: string,
  notes?: string,
) {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product || quantity <= 0) return;
  const beforeStock = product.currentStock;
  const afterStock = type === "increase" || type === "return"
    ? beforeStock + quantity
    : Math.max(0, beforeStock - quantity);
  await db.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, productId));
  await db.insert(stockMovementsTable).values({
    productId,
    type,
    quantity,
    beforeStock,
    afterStock,
    reason,
    notes: notes ?? null,
  } as any);
}

/** Deduct stock for all items in an order (booking reserves stock) */
async function deductOrderStock(items: any[], orderNumber: string) {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "decrease", item.quantity, `Order ${orderNumber}`);
    }
  }
}

/** Restore stock for all items (cancel/return/edit reversal) */
async function restoreOrderStock(items: any[], orderNumber: string, reasonSuffix = "") {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "increase", item.quantity, `Order ${orderNumber}${reasonSuffix}`);
    }
  }
}

function calcInvoiceTotals(items: any[], discount: number, transport: number, packageCharge: number, otherCharge: number) {
  let subtotal = 0;
  let cgst = 0, sgst = 0;
  const parsedItems = items.map((item: any) => {
    const lineTotal = item.quantity * item.unitPrice - (item.discount ?? 0);
    const lineGst = lineTotal * ((item.gstPercent ?? 0) / 100);
    cgst += lineGst / 2;
    sgst += lineGst / 2;
    subtotal += lineTotal;
    return { ...item, total: lineTotal + lineGst };
  });
  const gstAmount = cgst + sgst;
  const total = subtotal + gstAmount + transport + packageCharge + otherCharge - discount;
  return { subtotal, cgst, sgst, igst: 0, gstAmount, total, parsedItems };
}

router.get("/orders", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(dateFrom)));
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(ordersTable.createdAt, to));
  }
  if (search) {
    conditions.push(or(
      ilike(ordersTable.orderNumber, `%${search}%`),
      ilike(customersTable.name, `%${search}%`),
    ) as any);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .where(where);

  const rows = await db
    .select({
      order: ordersTable,
      customerName: customersTable.name,
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(invoicesTable, eq(invoicesTable.orderId, ordersTable.id))
    .where(where)
    .orderBy(sql`${ordersTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows.map(r => parseOrder({ ...r.order, invoiceId: r.invoiceId }, r.customerName ?? "", r.invoiceNumber)),
    total: countResult.count,
    page,
    limit,
  });
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, items, orderDate, notes } = parsed.data;

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const enrichedItems = await enrichItemNames(items as any[]);

  const [temp] = await db.insert(ordersTable).values({
    orderNumber: "TEMP",
    customerId,
    orderDate: orderDate ?? new Date().toISOString().slice(0, 10),
    notes: notes ?? null,
    items: enrichedItems,
  } as any).returning();

  const orderNumber = generateOrderNumber(temp.id);
  const [order] = await db.update(ordersTable).set({ orderNumber }).where(eq(ordersTable.id, temp.id)).returning();

  // Booking reserves stock
  await deductOrderStock(enrichedItems, orderNumber);

  res.status(201).json(parseOrder(order, customer.name));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({ order: ordersTable, customerName: customersTable.name, invoiceId: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(invoicesTable, eq(invoicesTable.orderId, ordersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(parseOrder({ ...row.order, invoiceId: row.invoiceId }, row.customerName ?? "", row.invoiceNumber));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (existing.status !== "pending") { res.status(400).json({ error: "Only pending orders can be edited" }); return; }

  const body = req.body as any;
  const updates: any = {};

  if (body.items && Array.isArray(body.items)) {
    const oldItems = Array.isArray(existing.items) ? existing.items : (typeof existing.items === "string" ? JSON.parse(existing.items as string) : []);
    await restoreOrderStock(oldItems, existing.orderNumber, " - edit reversal");

    const enrichedItems = await enrichItemNames(body.items);
    updates.items = enrichedItems;
    await deductOrderStock(enrichedItems, existing.orderNumber);
  }

  if (body.customerId !== undefined) updates.customerId = body.customerId;
  if (body.orderDate !== undefined) updates.orderDate = body.orderDate;
  if (body.notes !== undefined) updates.notes = body.notes || null;

  const [order] = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  res.json(parseOrder(order, cust?.name ?? ""));
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const params = DeleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (existing && existing.status === "pending") {
    const oldItems = Array.isArray(existing.items) ? existing.items : (typeof existing.items === "string" ? JSON.parse(existing.items as string) : []);
    await restoreOrderStock(oldItems, existing.orderNumber, " - deleted");
  }

  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.sendStatus(204);
});

/** Complete a pending order: generate its invoice, lock stock at final invoice quantities */
router.post("/orders/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CompleteOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "pending") { res.status(400).json({ error: "Only pending orders can be completed" }); return; }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const {
    invoiceType, status, paymentMethod, paidAmount = 0,
    transportCharge = 0, packageCharge = 0, otherCharge = 0,
    discount = 0, dueDate, notes, items,
  } = parsed.data;

  const discountAmt = parseFloat(String(discount));
  const transportAmt = parseFloat(String(transportCharge));
  const packageAmt = parseFloat(String(packageCharge));
  const otherAmt = parseFloat(String(otherCharge));

  const { subtotal, cgst, sgst, igst, gstAmount, total, parsedItems } = calcInvoiceTotals(items as any[], discountAmt, transportAmt, packageAmt, otherAmt);
  const paymentStatus = (paidAmount ?? 0) >= total ? "paid" : (paidAmount ?? 0) > 0 ? "partial" : "unpaid";
  const names = await enrichItemNames(parsedItems as any[]);
  const enrichedItems = parsedItems.map((item: any, i: number) => ({ ...item, productName: names[i].productName, sku: names[i].sku }));

  const [tempInvoice] = await db.insert(invoicesTable).values({
    invoiceNumber: "TEMP",
    customerId: order.customerId,
    orderId: order.id,
    type: invoiceType,
    status,
    subtotal: String(subtotal),
    discount: String(discountAmt),
    cgst: String(cgst),
    sgst: String(sgst),
    igst: String(igst),
    gstAmount: String(gstAmount),
    transport: String(transportAmt),
    packageCharge: String(packageAmt),
    otherCharge: String(otherAmt),
    total: String(total),
    paidAmount: String(paidAmount ?? 0),
    paymentStatus,
    paymentMethod: paymentMethod ?? null,
    dueDate: dueDate ?? null,
    notes: notes ?? null,
    items: enrichedItems,
  } as any).returning();

  const invoiceNumber = generateInvoiceNumber(tempInvoice.id);
  const [invoice] = await db.update(invoicesTable).set({ invoiceNumber }).where(eq(invoicesTable.id, tempInvoice.id)).returning();

  // Reconcile stock: order items were already deducted at booking time; adjust to match final invoice quantities
  const orderItems = Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items as string) : []);
  const orderQtyByProduct = new Map<number, number>();
  for (const item of orderItems) orderQtyByProduct.set(item.productId, (orderQtyByProduct.get(item.productId) ?? 0) + item.quantity);

  for (const item of enrichedItems as any[]) {
    const bookedQty = orderQtyByProduct.get(item.productId) ?? 0;
    const delta = item.quantity - bookedQty;
    if (delta > 0) {
      await adjustStock(item.productId, "decrease", delta, `Invoice ${invoiceNumber} - qty increase over booking`);
    } else if (delta < 0) {
      await adjustStock(item.productId, "increase", -delta, `Invoice ${invoiceNumber} - qty decrease from booking`);
    }
  }

  await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, order.id));

  res.status(201).json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: customer.name,
    orderId: invoice.orderId,
    orderNumber: order.orderNumber,
    type: invoice.type,
    status: invoice.status,
    subtotal: parseFloat(String(invoice.subtotal)),
    discount: parseFloat(String(invoice.discount)),
    cgst: parseFloat(String(invoice.cgst)),
    sgst: parseFloat(String(invoice.sgst)),
    igst: parseFloat(String(invoice.igst)),
    gstAmount: parseFloat(String(invoice.gstAmount)),
    transport: parseFloat(String(invoice.transport)),
    packageCharge: parseFloat(String(invoice.packageCharge)),
    otherCharge: parseFloat(String(invoice.otherCharge)),
    total: parseFloat(String(invoice.total)),
    paidAmount: parseFloat(String(invoice.paidAmount)),
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod ?? null,
    dueDate: invoice.dueDate ?? null,
    notes: invoice.notes ?? null,
    items: enrichedItems,
    createdAt: invoice.createdAt instanceof Date ? invoice.createdAt.toISOString() : invoice.createdAt,
  });
});

/** Cancel a pending order: restore stock, no invoice */
router.patch("/orders/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "pending") { res.status(400).json({ error: "Only pending orders can be cancelled" }); return; }

  const items = Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items as string) : []);
  await restoreOrderStock(items, order.orderNumber, " - cancelled");

  const [updated] = await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, order.id)).returning();
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
  res.json(parseOrder(updated, cust?.name ?? ""));
});

/** Return a completed order: mark its invoice returned, restore stock, exclude invoice from customer outstanding */
router.patch("/orders/:id/return", async (req, res): Promise<void> => {
  const params = ReturnOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "completed") { res.status(400).json({ error: "Only completed orders can be returned" }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, order.id));

  // Restore stock based on the invoice's final item quantities (falls back to order items if no invoice found)
  const itemsSource = invoice
    ? (Array.isArray(invoice.items) ? invoice.items : (typeof invoice.items === "string" ? JSON.parse(invoice.items as string) : []))
    : (Array.isArray(order.items) ? order.items : (typeof order.items === "string" ? JSON.parse(order.items as string) : []));
  await restoreOrderStock(itemsSource, order.orderNumber, " - returned");

  if (invoice) {
    await db.update(invoicesTable).set({ status: "returned" }).where(eq(invoicesTable.id, invoice.id));
  }

  const [updated] = await db.update(ordersTable).set({ status: "returned" }).where(eq(ordersTable.id, order.id)).returning();
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));
  res.json(parseOrder(updated, cust?.name ?? ""));
});

export default router;
