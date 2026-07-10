import { pgTable, text, serial, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { invoicesTable } from "./invoices";

export const creditNotesTable = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  creditNoteNumber: text("credit_note_number").notNull().unique(),
  // Credit notes are reversal documents and must always reference an existing invoice
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  // Type of credit note
  type: text("type").notNull(), // return | damaged | wrong_amount
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  // For "return" type: [{productId, productName, quantity, unitPrice, amount}]
  items: jsonb("items").notNull().default("[]"),
  status: text("status").notNull().default("pending"), // pending | applied
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CreditNote = typeof creditNotesTable.$inferSelect;
