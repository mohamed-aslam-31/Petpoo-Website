import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, gte, lte, or } from "drizzle-orm";
import { db, ordersTable, customersTable, productsTable, stockMovementsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  DeleteOrderParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseOrder(o: any, customerName?: string) {
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === "string" ? JSON.parse(o.items) : []);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: customerName ?? o.customerName ?? "",
    type: o.type,
    status: o.status,
    subtotal: parseFloat(String(o.subtotal ?? "0")),
    discount: parseFloat(String(o.discount ?? "0")),
    gstAmount: parseFloat(String(o.gstAmount ?? "0")),
    total: parseFloat(String(o.total ?? "0")),
    paidAmount: parseFloat(String(o.paidAmount ?? "0")),
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod ?? null,
    notes: o.notes ?? null,
    items,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
  };
}

function generateOrderNumber(id: number) {
  return `ORD${String(id).padStart(6, "0")}`;
}

function calcOrderTotals(items: any[], discount: number) {
  let subtotal = 0;
  let gstAmount = 0;
  const parsedItems = items.map((item: any) => {
    const lineTotal = item.quantity * item.unitPrice - (item.discount ?? 0);
    const lineGst = lineTotal * ((item.gstPercent ?? 0) / 100);
    subtotal += lineTotal;
    gstAmount += lineGst;
    return { ...item, total: lineTotal + lineGst };
  });
  const total = subtotal + gstAmount - discount;
  return { subtotal, gstAmount, total, parsedItems };
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

/** Deduct stock for all items in an order */
async function deductOrderStock(items: any[], orderNumber: string) {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "decrease", item.quantity, `Order ${orderNumber}`);
    }
  }
}

/** Reverse stock deductions for all items (used before updating order items) */
async function reverseOrderStock(items: any[], orderNumber: string) {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "increase", item.quantity, `Order ${orderNumber} - edit reversal`);
    }
  }
}

router.get("/orders", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (type) conditions.push(eq(ordersTable.type, type));
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
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      customerId: ordersTable.customerId,
      customerName: customersTable.name,
      type: ordersTable.type,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      discount: ordersTable.discount,
      gstAmount: ordersTable.gstAmount,
      total: ordersTable.total,
      paidAmount: ordersTable.paidAmount,
      paymentStatus: ordersTable.paymentStatus,
      paymentMethod: ordersTable.paymentMethod,
      notes: ordersTable.notes,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .where(where)
    .orderBy(sql`${ordersTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({ data: rows.map(r => parseOrder(r, r.customerName ?? "")), total: countResult.count, page, limit });
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, type, items, discount = 0, paymentMethod, paidAmount = 0, notes } = parsed.data;

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const discountAmt = parseFloat(String(discount));
  const { subtotal, gstAmount, total, parsedItems } = calcOrderTotals(items as any[], discountAmt);
  const paymentStatus = paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  const [temp] = await db.insert(ordersTable).values({
    orderNumber: "TEMP",
    customerId,
    type,
    subtotal: String(subtotal),
    discount: String(discountAmt),
    gstAmount: String(gstAmount),
    total: String(total),
    paidAmount: String(paidAmount),
    paymentStatus,
    paymentMethod: paymentMethod ?? null,
    notes: notes ?? null,
    items: parsedItems,
  } as any).returning();

  const orderNumber = generateOrderNumber(temp.id);
  const [order] = await db.update(ordersTable).set({ orderNumber }).where(eq(ordersTable.id, temp.id)).returning();

  // Deduct stock for each item
  await deductOrderStock(parsedItems, orderNumber);

  res.status(201).json(parseOrder(order, customer.name));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({ order: ordersTable, customerName: customersTable.name })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .where(eq(ordersTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(parseOrder(row.order, row.customerName ?? ""));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = req.body as any;
  const updates: any = {};

  // If items provided, recalculate totals and adjust stock
  if (body.items && Array.isArray(body.items)) {
    // Read existing order to get old items for reversal
    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
    if (existing) {
      const oldItems = Array.isArray(existing.items) ? existing.items : (typeof existing.items === "string" ? JSON.parse(existing.items as string) : []);
      await reverseOrderStock(oldItems, existing.orderNumber);
    }

    const discountAmt = parseFloat(String(body.discount ?? 0));
    const paidAmount = parseFloat(String(body.paidAmount ?? 0));
    const { subtotal, gstAmount, total, parsedItems } = calcOrderTotals(body.items, discountAmt);
    const paymentStatus = paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

    Object.assign(updates, {
      items: parsedItems,
      subtotal: String(subtotal),
      discount: String(discountAmt),
      gstAmount: String(gstAmount),
      total: String(total),
      paidAmount: String(paidAmount),
      paymentStatus,
    });

    // Deduct stock for new items
    const [updatedOrder] = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, params.data.id)).returning();
    if (!updatedOrder) { res.status(404).json({ error: "Order not found" }); return; }
    await deductOrderStock(parsedItems, updatedOrder.orderNumber);
    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, updatedOrder.customerId));
    res.json(parseOrder(updatedOrder, cust?.name ?? ""));
    return;
  }

  if (body.customerId !== undefined) updates.customerId = body.customerId;
  if (body.type !== undefined) updates.type = body.type;
  if (body.status !== undefined) updates.status = body.status;
  if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.paidAmount !== undefined) {
    updates.paidAmount = String(body.paidAmount);
    const [existing] = await db.select({ total: ordersTable.total }).from(ordersTable).where(eq(ordersTable.id, params.data.id));
    if (existing) {
      const total = parseFloat(String(existing.total));
      const paid = parseFloat(String(body.paidAmount));
      updates.paymentStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
    }
  }
  if (body.discount !== undefined) updates.discount = String(body.discount);

  const [order] = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  res.json(parseOrder(order, cust?.name ?? ""));
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const params = DeleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Reverse stock deductions before deleting
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (existing) {
    const oldItems = Array.isArray(existing.items) ? existing.items : (typeof existing.items === "string" ? JSON.parse(existing.items as string) : []);
    await reverseOrderStock(oldItems, existing.orderNumber);
  }

  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.sendStatus(204);
});

export default router;
