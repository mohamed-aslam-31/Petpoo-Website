import { and, eq } from "drizzle-orm";
import { db, accountingEntriesTable } from "@workspace/db";

export type AccountingSourceType = "invoice" | "credit_note";
export type AccountingAccount = "sales" | "receivable" | "refund";
export type AccountingDirection = "increase" | "decrease";

/**
 * Post one ledger entry. Amounts <= 0 are skipped (nothing to record).
 * Pass `tx` to keep the write atomic with the caller's transaction.
 */
export async function recordAccountingEntry(
  entry: {
    customerId: number;
    sourceType: AccountingSourceType;
    sourceId: number;
    sourceNumber: string;
    account: AccountingAccount;
    direction: AccountingDirection;
    amount: number;
    description?: string | null;
  },
  tx: Pick<typeof db, "insert"> = db,
): Promise<void> {
  if (!(entry.amount > 0)) return;
  await tx.insert(accountingEntriesTable).values({
    customerId: entry.customerId,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceNumber: entry.sourceNumber,
    account: entry.account,
    direction: entry.direction,
    amount: String(entry.amount),
    description: entry.description ?? null,
  } as any);
}

/**
 * Record the standard pair of entries an Invoice posts: increased sales and
 * increased customer receivable, both for the invoice's total amount.
 */
export async function recordInvoiceEntries(
  invoice: { id: number; invoiceNumber: string; customerId: number; total: number },
  tx: Pick<typeof db, "insert"> = db,
): Promise<void> {
  await recordAccountingEntry({
    customerId: invoice.customerId,
    sourceType: "invoice",
    sourceId: invoice.id,
    sourceNumber: invoice.invoiceNumber,
    account: "sales",
    direction: "increase",
    amount: invoice.total,
    description: `Invoice ${invoice.invoiceNumber} — sales recognized`,
  }, tx);
  await recordAccountingEntry({
    customerId: invoice.customerId,
    sourceType: "invoice",
    sourceId: invoice.id,
    sourceNumber: invoice.invoiceNumber,
    account: "receivable",
    direction: "increase",
    amount: invoice.total,
    description: `Invoice ${invoice.invoiceNumber} — receivable recorded`,
  }, tx);
}

/**
 * Record the standard set of entries a Credit Note posts: reduced sales and
 * reduced customer receivable, plus a refund/credit entry for return and
 * cancellation types (goods/money physically moving back to the customer).
 */
export async function recordCreditNoteEntries(
  creditNote: { id: number; creditNoteNumber: string; customerId: number; amount: number; type: string },
  tx: Pick<typeof db, "insert"> = db,
): Promise<void> {
  await recordAccountingEntry({
    customerId: creditNote.customerId,
    sourceType: "credit_note",
    sourceId: creditNote.id,
    sourceNumber: creditNote.creditNoteNumber,
    account: "sales",
    direction: "decrease",
    amount: creditNote.amount,
    description: `Credit Note ${creditNote.creditNoteNumber} — sales reversed`,
  }, tx);
  await recordAccountingEntry({
    customerId: creditNote.customerId,
    sourceType: "credit_note",
    sourceId: creditNote.id,
    sourceNumber: creditNote.creditNoteNumber,
    account: "receivable",
    direction: "decrease",
    amount: creditNote.amount,
    description: `Credit Note ${creditNote.creditNoteNumber} — receivable reduced`,
  }, tx);
  if (creditNote.type === "return" || creditNote.type === "cancellation") {
    await recordAccountingEntry({
      customerId: creditNote.customerId,
      sourceType: "credit_note",
      sourceId: creditNote.id,
      sourceNumber: creditNote.creditNoteNumber,
      account: "refund",
      direction: "increase",
      amount: creditNote.amount,
      description: `Credit Note ${creditNote.creditNoteNumber} — refund/credit issued`,
    }, tx);
  }
}

/** Remove every ledger entry posted by a given source document. Must run before/with its deletion. */
export async function deleteAccountingEntriesFor(
  sourceType: AccountingSourceType,
  sourceId: number,
  tx: Pick<typeof db, "delete"> = db,
): Promise<void> {
  await tx.delete(accountingEntriesTable).where(
    and(eq(accountingEntriesTable.sourceType, sourceType), eq(accountingEntriesTable.sourceId, sourceId)),
  );
}
