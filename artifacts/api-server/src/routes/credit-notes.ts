import { Router, type IRouter } from "express";
import { eq, sql, ilike } from "drizzle-orm";
import { z } from "zod";
import { db, creditNotesTable, customersTable, invoicesTable, productsTable, stockMovementsTable } from "@workspace/db";

const router: IRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────
const ReturnItemSchema = z.object({
  productId: z.number().int().positive(),
  productName: z.string().optional(),
  // Quantities must be whole numbers (stock is integer in DB)
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
});

const CreateCreditNoteSchema = z.object({
  invoiceId: z.number().int().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  customerId: z.number().int().positive(),
  type: z.enum(["return", "damaged", "wrong_amount"]),
  amount: z.number().min(0),
  reason: z.string().optional(),
  items: z.array(ReturnItemSchema).optional().default([]),
  notes: z.string().optional(),
});

const PatchCreditNoteSchema = z.object({
  status: z.enum(["pending", "applied"]).optional(),
  notes: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseNum(v: any) { return parseFloat(String(v ?? "0")); }

function generateCreditNoteNumber(id: number) {
  const year = new Date().getFullYear();
  return `CN${year}${String(id).padStart(5, "0")}`;
}

function parseCreditNote(cn: any, customerName?: string) {
  const items = Array.isArray(cn.items) ? cn.items : (typeof cn.items === "string" ? JSON.parse(cn.items) : []);
  return {
    id: cn.id,
    creditNoteNumber: cn.creditNoteNumber,
    invoiceId: cn.invoiceId ?? null,
    invoiceNumber: cn.invoiceNumber ?? null,
    customerId: cn.customerId,
    customerName: customerName ?? "",
    type: cn.type,
    amount: parseNum(cn.amount),
    reason: cn.reason ?? null,
    items,
    status: cn.status,
    notes: cn.notes ?? null,
    createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
  };
}

async function increaseStock(productId: number, quantity: number, reason: string) {
  // quantity must be a positive integer (DB schema uses integer)
  const intQty = Math.round(quantity);
  if (intQty <= 0) return;
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) return;
  const beforeStock = product.currentStock;
  const afterStock = beforeStock + intQty;
  await db.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, productId));
  await db.insert(stockMovementsTable).values({
    productId,
    type: "return",
    quantity: intQty,
    beforeStock,
    afterStock,
    reason,
    notes: null,
  } as any);
}

async function decreaseStock(productId: number, quantity: number, reason: string) {
  const intQty = Math.round(quantity);
  if (intQty <= 0) return;
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) return;
  const beforeStock = product.currentStock;
  const afterStock = Math.max(0, beforeStock - intQty);
  await db.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, productId));
  await db.insert(stockMovementsTable).values({
    productId,
    type: "adjustment",
    quantity: -(afterStock - beforeStock), // negative delta recorded as-is
    beforeStock,
    afterStock,
    reason: `[VOID] ${reason}`,
    notes: null,
  } as any);
}

// ── Routes ────────────────────────────────────────────────────────────────────
// GET /credit-notes
router.get("/credit-notes", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  const baseQuery = db
    .select({ cn: creditNotesTable, customerName: customersTable.name })
    .from(creditNotesTable)
    .leftJoin(customersTable, eq(customersTable.id, creditNotesTable.customerId));

  const countQuery = db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(creditNotesTable)
    .leftJoin(customersTable, eq(customersTable.id, creditNotesTable.customerId));

  let whereCondition: any = undefined;
  if (search) {
    whereCondition = ilike(creditNotesTable.creditNoteNumber, `%${search}%`);
  }

  const [countResult] = await (whereCondition ? countQuery.where(whereCondition) : countQuery);
  const rows = await (whereCondition
    ? baseQuery.where(whereCondition)
    : baseQuery)
    .orderBy(sql`${creditNotesTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows.map((r) => parseCreditNote(r.cn, r.customerName ?? "")),
    total: countResult.count,
    page,
    limit,
  });
});

// POST /credit-notes
router.post("/credit-notes", async (req, res): Promise<void> => {
  const parsed = CreateCreditNoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data;

  // Verify customer exists
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, data.customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  // Verify invoice if provided, and enforce invoice-customer consistency
  let invoiceNumber: string | null = data.invoiceNumber ?? null;
  if (data.invoiceId) {
    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, data.invoiceId));
    if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
    if (inv.customerId !== data.customerId) {
      res.status(400).json({ error: "Invoice does not belong to the selected customer" });
      return;
    }
    invoiceNumber = inv.invoiceNumber;
  }

  const [temp] = await db.insert(creditNotesTable).values({
    creditNoteNumber: "TEMP",
    invoiceId: data.invoiceId ?? null,
    invoiceNumber: invoiceNumber ?? null,
    customerId: data.customerId,
    type: data.type,
    amount: String(data.amount),
    reason: data.reason ?? null,
    items: (data.items ?? []) as any,
    status: "pending",
    notes: data.notes ?? null,
  } as any).returning();

  const creditNoteNumber = generateCreditNoteNumber(temp.id);
  const [creditNote] = await db.update(creditNotesTable)
    .set({ creditNoteNumber })
    .where(eq(creditNotesTable.id, temp.id))
    .returning();

  // For "return" type: increase stock for each returned item (integer quantities)
  if (data.type === "return" && data.items && data.items.length > 0) {
    for (const item of data.items) {
      if (item.productId && item.quantity > 0) {
        await increaseStock(item.productId, item.quantity, `Credit Note ${creditNoteNumber} - customer return`);
      }
    }
  }

  // Reduce customer outstanding by credit amount (all types)
  const currentOutstanding = parseNum(customer.outstanding);
  const newOutstanding = Math.max(0, currentOutstanding - data.amount);
  await db.update(customersTable)
    .set({ outstanding: String(newOutstanding) })
    .where(eq(customersTable.id, data.customerId));

  res.status(201).json(parseCreditNote(creditNote, customer.name));
});

// GET /credit-notes/:id
router.get("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ cn: creditNotesTable, customerName: customersTable.name })
    .from(creditNotesTable)
    .leftJoin(customersTable, eq(customersTable.id, creditNotesTable.customerId))
    .where(eq(creditNotesTable.id, id));

  if (!row) { res.status(404).json({ error: "Credit note not found" }); return; }
  res.json(parseCreditNote(row.cn, row.customerName ?? ""));
});

// PATCH /credit-notes/:id (status/notes update only — amount and type are immutable)
router.patch("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = PatchCreditNoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
  if (parsed.data.reason !== undefined) updates.reason = parsed.data.reason ?? null;

  const [cn] = await db.update(creditNotesTable).set(updates).where(eq(creditNotesTable.id, id)).returning();
  if (!cn) { res.status(404).json({ error: "Credit note not found" }); return; }

  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, cn.customerId));
  res.json(parseCreditNote(cn, cust?.name ?? ""));
});

// DELETE /credit-notes/:id — reverses financial and stock effects
router.delete("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [cn] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!cn) { res.status(404).json({ error: "Credit note not found" }); return; }

  // Reverse outstanding reduction
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, cn.customerId));
  if (customer) {
    const restoredOutstanding = parseNum(customer.outstanding) + parseNum(cn.amount);
    await db.update(customersTable)
      .set({ outstanding: String(restoredOutstanding) })
      .where(eq(customersTable.id, cn.customerId));
  }

  // Reverse stock increase for return-type credit notes
  if (cn.type === "return") {
    const items = Array.isArray(cn.items) ? cn.items as any[] : [];
    for (const item of items) {
      if (item.productId && item.quantity > 0) {
        await decreaseStock(item.productId, item.quantity, `Void Credit Note ${cn.creditNoteNumber}`);
      }
    }
  }

  await db.delete(creditNotesTable).where(eq(creditNotesTable.id, id));
  res.sendStatus(204);
});

export default router;
