import { eq } from "drizzle-orm";
import { db, creditNotesTable, customersTable, productsTable, stockMovementsTable } from "@workspace/db";
import { logAudit } from "./audit";
import { deleteAccountingEntriesFor } from "./accounting";

function parseNum(v: any) { return parseFloat(String(v ?? "0")); }

/** Reverse a return-type credit note's stock increase. Must run inside the caller's transaction. */
async function reverseCreditNoteStock(items: any[], reason: string, tx: any) {
  for (const item of items) {
    if (!item.productId || !(item.quantity > 0)) continue;
    const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) continue;
    const intQty = Math.round(item.quantity);
    const beforeStock = product.currentStock;
    const afterStock = Math.max(0, beforeStock - intQty);
    await tx.update(productsTable).set({ currentStock: afterStock }).where(eq(productsTable.id, item.productId));
    await tx.insert(stockMovementsTable).values({
      productId: item.productId,
      type: "adjustment",
      quantity: -(afterStock - beforeStock),
      beforeStock,
      afterStock,
      reason: `[VOID] ${reason}`,
      notes: null,
    } as any);
  }
}

/**
 * Cascade-delete every credit note linked to an invoice, reversing each one's
 * financial (customer outstanding) and stock effects first.
 * A credit note can only exist attached to an invoice — once the invoice is gone
 * (deleted, or cascaded away via its parent order/quotation), any credit notes
 * referencing it must go too, with their effects fully unwound. Must run inside
 * the caller's transaction so this is atomic with the invoice deletion.
 */
export async function cascadeDeleteCreditNotesForInvoice(invoiceId: number, reason: string, tx: any): Promise<void> {
  const notes = await tx.select().from(creditNotesTable).where(eq(creditNotesTable.invoiceId, invoiceId));
  for (const cn of notes) {
    const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, cn.customerId));
    if (customer) {
      const restoredOutstanding = parseNum(customer.outstanding) + parseNum(cn.amount);
      await tx.update(customersTable)
        .set({ outstanding: String(restoredOutstanding) })
        .where(eq(customersTable.id, cn.customerId));
    }

    if (cn.type === "return") {
      const items = Array.isArray(cn.items) ? cn.items as any[] : [];
      await reverseCreditNoteStock(items, `Credit Note ${cn.creditNoteNumber} - ${reason}`, tx);
    }

    await deleteAccountingEntriesFor("credit_note", cn.id, tx);
    await tx.delete(creditNotesTable).where(eq(creditNotesTable.id, cn.id));
    await logAudit({
      entityType: "credit_note",
      entityId: cn.id,
      entityNumber: cn.creditNoteNumber,
      action: "cascaded_delete",
      oldStatus: cn.status,
      notes: reason,
    }, tx);
  }
}
