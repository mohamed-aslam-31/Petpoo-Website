import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, gte, lte, or } from "drizzle-orm";
import { db, invoicesTable, customersTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseInvoice(inv: any, customerName?: string) {
  const items = Array.isArray(inv.items) ? inv.items : (typeof inv.items === "string" ? JSON.parse(inv.items) : []);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: customerName ?? inv.customerName ?? "",
    type: inv.type,
    status: inv.status,
    subtotal: parseFloat(String(inv.subtotal ?? "0")),
    discount: parseFloat(String(inv.discount ?? "0")),
    cgst: parseFloat(String(inv.cgst ?? "0")),
    sgst: parseFloat(String(inv.sgst ?? "0")),
    igst: parseFloat(String(inv.igst ?? "0")),
    gstAmount: parseFloat(String(inv.gstAmount ?? "0")),
    transport: parseFloat(String(inv.transport ?? "0")),
    total: parseFloat(String(inv.total ?? "0")),
    paidAmount: parseFloat(String(inv.paidAmount ?? "0")),
    paymentStatus: inv.paymentStatus,
    paymentMethod: inv.paymentMethod ?? null,
    dueDate: inv.dueDate ?? null,
    notes: inv.notes ?? null,
    items,
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
  };
}

function generateInvoiceNumber(id: number) {
  const year = new Date().getFullYear();
  return `INV${year}${String(id).padStart(5, "0")}`;
}

function calcInvoiceTotals(items: any[], discount: number, transport: number) {
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
  const total = subtotal + gstAmount + transport - discount;
  return { subtotal, cgst, sgst, igst: 0, gstAmount, total, parsedItems };
}

router.get("/invoices", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  const customerId = req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(invoicesTable.status, status));
  if (type) conditions.push(eq(invoicesTable.type, type));
  if (customerId) conditions.push(eq(invoicesTable.customerId, customerId));
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(invoicesTable.createdAt, to));
  }
  if (search) {
    conditions.push(or(
      ilike(invoicesTable.invoiceNumber, `%${search}%`),
      ilike(customersTable.name, `%${search}%`),
    ) as any);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(where);

  const rows = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      type: invoicesTable.type,
      status: invoicesTable.status,
      subtotal: invoicesTable.subtotal,
      discount: invoicesTable.discount,
      cgst: invoicesTable.cgst,
      sgst: invoicesTable.sgst,
      igst: invoicesTable.igst,
      gstAmount: invoicesTable.gstAmount,
      transport: invoicesTable.transport,
      total: invoicesTable.total,
      paidAmount: invoicesTable.paidAmount,
      paymentStatus: invoicesTable.paymentStatus,
      paymentMethod: invoicesTable.paymentMethod,
      dueDate: invoicesTable.dueDate,
      notes: invoicesTable.notes,
      items: invoicesTable.items,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(where)
    .orderBy(sql`${invoicesTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({ data: rows.map(r => parseInvoice(r, r.customerName ?? "")), total: countResult.count, page, limit });
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, type, items, discount = 0, transport = 0, paymentMethod, paidAmount = 0, dueDate, notes } = parsed.data;

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const discountAmt = parseFloat(String(discount));
  const transportAmt = parseFloat(String(transport));
  const { subtotal, cgst, sgst, igst, gstAmount, total, parsedItems } = calcInvoiceTotals(items as any[], discountAmt, transportAmt);
  const paymentStatus = (paidAmount ?? 0) >= total ? "paid" : (paidAmount ?? 0) > 0 ? "partial" : "unpaid";

  const [temp] = await db.insert(invoicesTable).values({
    invoiceNumber: "TEMP",
    customerId,
    type,
    subtotal: String(subtotal),
    discount: String(discountAmt),
    cgst: String(cgst),
    sgst: String(sgst),
    igst: String(igst),
    gstAmount: String(gstAmount),
    transport: String(transportAmt),
    total: String(total),
    paidAmount: String(paidAmount ?? 0),
    paymentStatus,
    paymentMethod: paymentMethod ?? null,
    dueDate: dueDate ?? null,
    notes: notes ?? null,
    items: parsedItems,
  } as any).returning();

  const [invoice] = await db.update(invoicesTable).set({ invoiceNumber: generateInvoiceNumber(temp.id) }).where(eq(invoicesTable.id, temp.id)).returning();
  res.status(201).json(parseInvoice(invoice, customer.name));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({ inv: invoicesTable, customerName: customersTable.name })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(eq(invoicesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(parseInvoice(row.inv, row.customerName ?? ""));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = req.body as any;
  const updates: any = {};

  // If items provided, recalculate totals
  if (body.items && Array.isArray(body.items)) {
    const discountAmt = parseFloat(String(body.discount ?? 0));
    const transportAmt = parseFloat(String(body.transport ?? 0));
    const paidAmount = parseFloat(String(body.paidAmount ?? 0));
    const { subtotal, cgst, sgst, igst, gstAmount, total, parsedItems } = calcInvoiceTotals(body.items, discountAmt, transportAmt);
    const paymentStatus = paidAmount >= total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

    Object.assign(updates, {
      items: parsedItems,
      subtotal: String(subtotal),
      discount: String(discountAmt),
      cgst: String(cgst),
      sgst: String(sgst),
      igst: String(igst),
      gstAmount: String(gstAmount),
      transport: String(transportAmt),
      total: String(total),
      paidAmount: String(paidAmount),
      paymentStatus,
    });
  }

  if (body.customerId !== undefined) updates.customerId = body.customerId;
  if (body.type !== undefined) updates.type = body.type;
  if (body.status !== undefined) updates.status = body.status;
  if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (!body.items) {
    if (body.paidAmount !== undefined) {
      updates.paidAmount = String(body.paidAmount);
      // Recalc payment status if paidAmount changed without items
      const [existing] = await db.select({ total: invoicesTable.total }).from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
      if (existing) {
        const total = parseFloat(String(existing.total));
        const paid = parseFloat(String(body.paidAmount));
        updates.paymentStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
      }
    }
    if (body.discount !== undefined) updates.discount = String(body.discount);
    if (body.transport !== undefined) updates.transport = String(body.transport);
  }

  const [invoice] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, invoice.customerId));
  res.json(parseInvoice(invoice, cust?.name ?? ""));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [invoice] = await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.sendStatus(204);
});

export default router;
