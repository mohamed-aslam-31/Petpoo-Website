import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, or } from "drizzle-orm";
import { z } from "zod";
import { db, quotationsTable, customersTable } from "@workspace/db";

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
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional().default("draft"),
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
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
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
    createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
// GET /quotations
router.get("/quotations", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;

  const conditions: any[] = [];
  if (status) conditions.push(eq(quotationsTable.status, status));
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

  // Verify existing customer if provided
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

  // Verify customer if switching to existing
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

  // Recalculate totals if items provided
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

  const [quotation] = await db.update(quotationsTable).set(updates).where(eq(quotationsTable.id, id)).returning();
  if (!quotation) { res.status(404).json({ error: "Quotation not found" }); return; }

  let customerDbName: string | null = null;
  if (!quotation.isNewCustomer && quotation.customerId) {
    const [cust] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, quotation.customerId));
    customerDbName = cust?.name ?? null;
  }
  res.json(parseQuotation(quotation, customerDbName));
});

// DELETE /quotations/:id
router.delete("/quotations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [q] = await db.delete(quotationsTable).where(eq(quotationsTable.id, id)).returning();
  if (!q) { res.status(404).json({ error: "Quotation not found" }); return; }
  res.sendStatus(204);
});

export default router;
