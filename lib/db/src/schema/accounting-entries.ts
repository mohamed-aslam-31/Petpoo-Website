import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

/**
 * Simple ledger of accounting effects driven by Invoices and Credit Notes.
 * Each invoice creation posts a "sales increase" + "receivable increase" entry.
 * Each credit note creation posts the reversal ("sales decrease" + "receivable
 * decrease", plus a "refund increase" for return/cancellation types).
 * Entries are removed when their source document (invoice or credit note) is
 * deleted/cascade-deleted, so the ledger always reflects live documents only.
 */
export const accountingEntriesTable = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  // 'invoice' | 'credit_note' — the document that produced this entry
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  sourceNumber: text("source_number").notNull(),
  // 'sales' | 'receivable' | 'refund'
  account: text("account").notNull(),
  // 'increase' | 'decrease'
  direction: text("direction").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountingEntry = typeof accountingEntriesTable.$inferSelect;
