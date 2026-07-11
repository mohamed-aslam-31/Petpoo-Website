import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, gte, lte, or } from "drizzle-orm";
import { db, invoicesTable, ordersTable, customersTable, productsTable, stockMovementsTable, quotationsTable, creditNotesTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { cascadeDeleteCreditNotesForInvoice } from "../lib/credit-notes";
import { recordInvoiceEntries, recordCreditNoteEntries, deleteAccountingEntriesFor } from "../lib/accounting";

const router: IRouter = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function generateCreditNoteNumber(id: number) {
  const year = new Date().getFullYear();
  return `CN${year}${String(id).padStart(5, "0")}`;
}

function parseItems(raw: any): any[] {
  return Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);
}

function parseInvoice(inv: any, customerName?: string, orderNumber?: string | null, quotationNumber?: string | null) {
  const items = parseItems(inv.items);
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: customerName ?? inv.customerName ?? "",
    orderId: inv.orderId ?? null,
    orderNumber: orderNumber ?? null,
    quotationId: inv.quotationId ?? null,
    quotationNumber: quotationNumber ?? null,
    createdFrom: inv.createdFrom ?? "direct",
    type: inv.type,
    status: inv.status,
    subtotal: parseFloat(String(inv.subtotal ?? "0")),
    discount: parseFloat(String(inv.discount ?? "0")),
    cgst: parseFloat(String(inv.cgst ?? "0")),
    sgst: parseFloat(String(inv.sgst ?? "0")),
    igst: parseFloat(String(inv.igst ?? "0")),
    gstAmount: parseFloat(String(inv.gstAmount ?? "0")),
    transport: parseFloat(String(inv.transport ?? "0")),
    packageCharge: parseFloat(String(inv.packageCharge ?? "0")),
    otherCharge: parseFloat(String(inv.otherCharge ?? "0")),
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

/** Adjust a single product's stock and record a movement. Pass `tx` to run inside an existing transaction. */
async function adjustStock(
  productId: number,
  type: "increase" | "decrease" | "damage" | "lost" | "return",
  quantity: number,
  reason: string,
  notes?: string,
  tx?: any,
) {
  const dbOrTx = tx ?? db;
  const [product] = await dbOrTx.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product || quantity <= 0) return;
  const beforeStock = product.currentStock;
  const afterStock = type === "increase" || type === "return"
    ? beforeStock + quantity
    : Math.max(0, beforeStock - quantity);
  await dbOrTx.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, productId));
  await dbOrTx.insert(stockMovementsTable).values({
    productId,
    type,
    quantity,
    beforeStock,
    afterStock,
    reason,
    notes: notes ?? null,
  } as any);
}

/** Deduct stock for all items in a standalone (not order-linked) invoice */
async function deductInvoiceStock(items: any[], invoiceNumber: string) {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "decrease", item.quantity, `Invoice ${invoiceNumber}`);
    }
  }
}

/** Reverse stock deductions for all items. Pass `tx` to run inside an existing transaction. */
async function reverseInvoiceStock(items: any[], invoiceNumber: string, reasonSuffix = " - edit reversal", tx?: any) {
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await adjustStock(item.productId, "increase", item.quantity, `Invoice ${invoiceNumber}${reasonSuffix}`, undefined, tx);
    }
  }
}

/**
 * When an order-linked invoice is cancelled, returned or deleted, sync the parent
 * order (and, transitively, its parent quotation) so the whole chain stays consistent.
 */
async function cascadeToOrderAndQuotation(invoice: any, newOrderStatus: "pending" | "returned", reason: string) {
  if (!invoice.orderId) return;
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, invoice.orderId));
    if (!order) return;
    if (order.status === newOrderStatus) return;

    await tx.update(ordersTable).set({ status: newOrderStatus }).where(eq(ordersTable.id, order.id));
    await logAudit({
      entityType: "order",
      entityId: order.id,
      entityNumber: order.orderNumber,
      action: "cascaded_status",
      oldStatus: order.status,
      newStatus: newOrderStatus,
      notes: reason,
    }, tx);

    if (order.quotationId) {
      const [quotation] = await tx.select().from(quotationsTable).where(eq(quotationsTable.id, order.quotationId));
      if (quotation && quotation.status !== "sent") {
        await tx.update(quotationsTable)
          .set({ status: "sent", convertedOrderId: null, convertedOrderNumber: null } as any)
          .where(eq(quotationsTable.id, quotation.id));
        await logAudit({
          entityType: "quotation",
          entityId: quotation.id,
          entityNumber: quotation.quotationNumber,
          action: "cascaded_status",
          oldStatus: quotation.status,
          newStatus: "sent",
          notes: reason,
        }, tx);
      }
    }
  });
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
  const createdFrom = req.query.createdFrom as string | undefined;

  const conditions = [];
  if (status) conditions.push(eq(invoicesTable.status, status));
  if (type) conditions.push(eq(invoicesTable.type, type));
  if (customerId) conditions.push(eq(invoicesTable.customerId, customerId));
  if (createdFrom) conditions.push(eq(invoicesTable.createdFrom, createdFrom));
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
    .select({ inv: invoicesTable, customerName: customersTable.name, orderNumber: ordersTable.orderNumber, quotationNumber: quotationsTable.quotationNumber })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .leftJoin(ordersTable, eq(ordersTable.id, invoicesTable.orderId))
    .leftJoin(quotationsTable, eq(quotationsTable.id, invoicesTable.quotationId))
    .where(where)
    .orderBy(sql`${invoicesTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({ data: rows.map(r => parseInvoice(r.inv, r.customerName ?? "", r.orderNumber, r.quotationNumber)), total: countResult.count, page, limit });
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { customerId, type, status, items, discount = 0, transport = 0, packageCharge = 0, otherCharge = 0, paymentMethod, paidAmount = 0, dueDate, notes } = parsed.data as any;

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const discountAmt = parseFloat(String(discount));
  const transportAmt = parseFloat(String(transport));
  const packageAmt = parseFloat(String(packageCharge));
  const otherAmt = parseFloat(String(otherCharge));
  const { subtotal, cgst, sgst, igst, gstAmount, total, parsedItems } = calcInvoiceTotals(items as any[], discountAmt, transportAmt, packageAmt, otherAmt);
  const paymentStatus = (paidAmount ?? 0) >= total ? "paid" : (paidAmount ?? 0) > 0 ? "partial" : "unpaid";

  const [temp] = await db.insert(invoicesTable).values({
    invoiceNumber: "TEMP",
    customerId,
    type,
    status: status ?? "processing",
    createdFrom: "direct",
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
    items: parsedItems,
  } as any).returning();

  const invoiceNumber = generateInvoiceNumber(temp.id);
  const [invoice] = await db.update(invoicesTable).set({ invoiceNumber }).where(eq(invoicesTable.id, temp.id)).returning();

  // Standalone invoices (not generated from an order) deduct stock directly
  await deductInvoiceStock(parsedItems, invoiceNumber);

  // Post accounting effects: increase sales + increase customer receivable
  await recordInvoiceEntries({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, total });

  await logAudit({ entityType: "invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber, action: "created", newStatus: invoice.status });

  res.status(201).json(parseInvoice(invoice, customer.name));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db
    .select({ inv: invoicesTable, customerName: customersTable.name, orderNumber: ordersTable.orderNumber, quotationNumber: quotationsTable.quotationNumber })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .leftJoin(ordersTable, eq(ordersTable.id, invoicesTable.orderId))
    .leftJoin(quotationsTable, eq(quotationsTable.id, invoicesTable.quotationId))
    .where(eq(invoicesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(parseInvoice(row.inv, row.customerName ?? "", row.orderNumber, row.quotationNumber));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const body = req.body as any;
  const updates: any = {};

  const isTerminalTransition = body.status && ["cancelled", "returned"].includes(body.status) && !["cancelled", "returned"].includes(existing.status);

  // If items provided and this invoice isn't order-linked, recalc totals and adjust stock directly.
  // Order-linked invoices keep locked products; qty/price/gst/discount edits still recalc totals but don't touch stock here (handled via order return flow).
  if (body.items && Array.isArray(body.items)) {
    if (!existing.orderId) {
      const oldItems = parseItems(existing.items);
      await reverseInvoiceStock(oldItems, existing.invoiceNumber);
    }

    const discountAmt = parseFloat(String(body.discount ?? existing.discount ?? 0));
    const transportAmt = parseFloat(String(body.transport ?? existing.transport ?? 0));
    const packageAmt = parseFloat(String(body.packageCharge ?? existing.packageCharge ?? 0));
    const otherAmt = parseFloat(String(body.otherCharge ?? existing.otherCharge ?? 0));
    const paidAmount = parseFloat(String(body.paidAmount ?? existing.paidAmount ?? 0));
    const { subtotal, cgst, sgst, igst, gstAmount, total, parsedItems } = calcInvoiceTotals(body.items, discountAmt, transportAmt, packageAmt, otherAmt);
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
      packageCharge: String(packageAmt),
      otherCharge: String(otherAmt),
      total: String(total),
      paidAmount: String(paidAmount),
      paymentStatus,
    });

    if (body.customerId !== undefined) updates.customerId = body.customerId;
    if (body.type !== undefined) updates.type = body.type;
    if (body.status !== undefined) updates.status = body.status;
    if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;

    const [invoice] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, params.data.id)).returning();
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    if (!existing.orderId) {
      await deductInvoiceStock(parsedItems, invoice.invoiceNumber);
    }

    if (isTerminalTransition) {
      await logAudit({ entityType: "invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber, action: "status_changed", oldStatus: existing.status, newStatus: invoice.status });
      await cascadeToOrderAndQuotation(invoice, invoice.status === "returned" ? "returned" : "pending", `Invoice ${invoice.invoiceNumber} was ${invoice.status}`);
    }

    const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, invoice.customerId));
    res.json(parseInvoice(invoice, cust?.name ?? ""));
    return;
  }

  if (body.customerId !== undefined) updates.customerId = body.customerId;
  if (body.type !== undefined) updates.type = body.type;
  if (body.status !== undefined) updates.status = body.status;
  if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.paidAmount !== undefined) {
    updates.paidAmount = String(body.paidAmount);
    const [existingTotal] = await db.select({ total: invoicesTable.total }).from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (existingTotal) {
      const total = parseFloat(String(existingTotal.total));
      const paid = parseFloat(String(body.paidAmount));
      updates.paymentStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
    }
  }
  if (body.discount !== undefined) updates.discount = String(body.discount);
  if (body.transport !== undefined) updates.transport = String(body.transport);
  if (body.packageCharge !== undefined) updates.packageCharge = String(body.packageCharge);
  if (body.otherCharge !== undefined) updates.otherCharge = String(body.otherCharge);

  // Terminal status transitions (cancelled/returned) restore stock exactly once
  if (isTerminalTransition) {
    const items = parseItems(existing.items);
    await reverseInvoiceStock(items, existing.invoiceNumber, ` - ${body.status}`);
  }

  const [invoice] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (isTerminalTransition) {
    await logAudit({ entityType: "invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber, action: "status_changed", oldStatus: existing.status, newStatus: invoice.status });
    await cascadeToOrderAndQuotation(invoice, invoice.status === "returned" ? "returned" : "pending", `Invoice ${invoice.invoiceNumber} was ${invoice.status}`);
  }

  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, invoice.customerId));
  res.json(parseInvoice(invoice, cust?.name ?? ""));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  // All mutations run in one transaction: stock reversal, invoice delete, order delete,
  // and quotation revert are atomic — a partial failure can't leave orphan records.
  await db.transaction(async (tx) => {
    // Reverse stock, unless already cancelled/returned (stock was restored at that point)
    if (!["cancelled", "returned"].includes(existing.status)) {
      await reverseInvoiceStock(parseItems(existing.items), existing.invoiceNumber, " - deleted", tx);
    }

    // A credit note can only exist while its invoice does — unwind any first.
    await cascadeDeleteCreditNotesForInvoice(existing.id, `Invoice ${existing.invoiceNumber} was deleted`, tx);

    // Remove this invoice's own accounting entries (sales/receivable increase).
    await deleteAccountingEntriesFor("invoice", existing.id, tx);

    await tx.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    await logAudit({ entityType: "invoice", entityId: existing.id, entityNumber: existing.invoiceNumber, action: "deleted", oldStatus: existing.status }, tx);

    // Per spec: deleting an invoice must also delete the linked order and revert the quotation to "sent".
    if (existing.orderId) {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, existing.orderId));
      if (order) {
        await tx.delete(ordersTable).where(eq(ordersTable.id, order.id));
        await logAudit({ entityType: "order", entityId: order.id, entityNumber: order.orderNumber, action: "cascaded_delete", oldStatus: order.status, notes: `Invoice ${existing.invoiceNumber} was deleted` }, tx);

        if (order.quotationId) {
          const [quotation] = await tx.select().from(quotationsTable).where(eq(quotationsTable.id, order.quotationId));
          if (quotation) {
            await tx.update(quotationsTable)
              .set({ status: "sent", convertedOrderId: null, convertedOrderNumber: null } as any)
              .where(eq(quotationsTable.id, quotation.id));
            await logAudit({ entityType: "quotation", entityId: quotation.id, entityNumber: quotation.quotationNumber, action: "cascaded_status", oldStatus: quotation.status, newStatus: "sent", notes: `Invoice ${existing.invoiceNumber} was deleted` }, tx);
          }
        }
      }
    }
  });

  res.sendStatus(204);
});

/**
 * Cancel a finalized invoice: auto-create a full reversal credit note against
 * whatever balance/items haven't already been credited, restore stock for those
 * items, post the accounting reversal, and mark the invoice "cancelled" — the
 * invoice row itself is kept (never deleted) so it remains in the audit trail.
 */
router.post("/invoices/:id/cancel", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { reason, notes } = (req.body ?? {}) as { reason?: string; notes?: string };

  try {
    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id)).for("update");
      if (!invoice) throw new HttpError(404, "Invoice not found");
      if (["cancelled", "returned"].includes(invoice.status)) {
        throw new HttpError(400, `Invoice is already ${invoice.status}`);
      }

      const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, invoice.customerId));
      if (!customer) throw new HttpError(404, "Customer not found");

      const invoiceTotal = parseFloat(String(invoice.total));
      const existingNotes = await tx.select().from(creditNotesTable).where(eq(creditNotesTable.invoiceId, invoice.id));
      const alreadyCredited = existingNotes.reduce((sum, n) => sum + parseFloat(String(n.amount)), 0);
      const remainingAmount = Math.max(0, invoiceTotal - alreadyCredited);

      // Only restock items that haven't already been returned by an earlier credit note
      const invoiceItems = parseItems(invoice.items);
      const alreadyReturnedByProduct = new Map<number, number>();
      for (const n of existingNotes) {
        if (n.type !== "return" && n.type !== "cancellation") continue;
        const items = Array.isArray(n.items) ? (n.items as any[]) : [];
        for (const it of items) alreadyReturnedByProduct.set(it.productId, (alreadyReturnedByProduct.get(it.productId) ?? 0) + (it.quantity ?? 0));
      }
      const remainingItems = invoiceItems
        .filter((it: any) => it.productId)
        .map((it: any) => {
          const already = alreadyReturnedByProduct.get(it.productId) ?? 0;
          const remainingQty = Math.max(0, Math.round((it.quantity ?? 0) - already));
          return { productId: it.productId, productName: it.productName, quantity: remainingQty, unitPrice: it.unitPrice, amount: remainingQty * (it.unitPrice ?? 0) };
        })
        .filter((it: any) => it.quantity > 0);

      let creditNote: any = null;
      if (remainingAmount > 0.01) {
        const [temp] = await tx.insert(creditNotesTable).values({
          creditNoteNumber: "TEMP",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          type: "cancellation",
          amount: String(remainingAmount),
          reason: reason ?? "Invoice cancelled",
          items: remainingItems as any,
          status: "applied",
          notes: notes ?? null,
        } as any).returning();

        const creditNoteNumber = generateCreditNoteNumber(temp.id);
        [creditNote] = await tx.update(creditNotesTable).set({ creditNoteNumber }).where(eq(creditNotesTable.id, temp.id)).returning();

        for (const item of remainingItems) {
          if (item.productId && item.quantity > 0) {
            await adjustStock(item.productId, "return", item.quantity, `Credit Note ${creditNoteNumber} - invoice cancelled`, undefined, tx);
          }
        }

        await recordCreditNoteEntries({
          id: creditNote.id,
          creditNoteNumber: creditNote.creditNoteNumber,
          customerId: creditNote.customerId,
          amount: remainingAmount,
          type: "cancellation",
        }, tx);

        await logAudit({ entityType: "credit_note", entityId: creditNote.id, entityNumber: creditNote.creditNoteNumber, action: "created", newStatus: creditNote.status, notes: `Auto-created cancelling invoice ${invoice.invoiceNumber}` }, tx);
      }

      const [updatedInvoice] = await tx.update(invoicesTable).set({ status: "cancelled" }).where(eq(invoicesTable.id, invoice.id)).returning();

      await logAudit({ entityType: "invoice", entityId: invoice.id, entityNumber: invoice.invoiceNumber, action: "status_changed", oldStatus: invoice.status, newStatus: "cancelled", notes: reason ?? "Invoice cancelled" }, tx);

      return { invoice: updatedInvoice, creditNote, customerName: customer.name };
    });

    // Keep the order/quotation chain consistent with every other terminal invoice transition.
    if (result.invoice.orderId) {
      await cascadeToOrderAndQuotation(result.invoice, "pending", `Invoice ${result.invoice.invoiceNumber} was cancelled`);
    }

    res.json({
      invoice: parseInvoice(result.invoice, result.customerName),
      creditNote: result.creditNote
        ? { id: result.creditNote.id, creditNoteNumber: result.creditNote.creditNoteNumber, amount: parseFloat(String(result.creditNote.amount)) }
        : null,
    });
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    throw err;
  }
});

export default router;
