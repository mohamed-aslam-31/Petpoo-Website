import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, ordersTable, customersTable } from "@workspace/db";
import {
  CreateOrderBody,
  UpdateOrderBody,
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

router.get("/orders", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (type) conditions.push(eq(ordersTable.type, type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(ordersTable).where(where);

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

  let subtotal = 0;
  let gstAmount = 0;
  const parsedItems = items.map((item: any) => {
    const lineTotal = item.quantity * item.unitPrice - (item.discount ?? 0);
    const lineGst = lineTotal * ((item.gstPercent ?? 18) / 100);
    subtotal += lineTotal;
    gstAmount += lineGst;
    return { ...item, total: lineTotal + lineGst };
  });

  const discountAmt = parseFloat(String(discount));
  const total = subtotal + gstAmount - discountAmt;
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

  const [order] = await db.update(ordersTable).set({ orderNumber: generateOrderNumber(temp.id) }).where(eq(ordersTable.id, temp.id)).returning();

  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  res.status(201).json(parseOrder(order, cust.name));
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
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [order] = await db.update(ordersTable).set(parsed.data as any).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  res.json(parseOrder(order, cust?.name ?? ""));
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const params = DeleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.sendStatus(204);
});

export default router;
