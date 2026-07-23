import { pgTable, text, serial, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  purchaseNumber: text("purchase_number").notNull().unique(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id),
  purchaseDate: text("purchase_date").notNull(),
  items: jsonb("items").notNull().$type<any[]>().default([]),
  packingCharges: numeric("packing_charges", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  transportCharges: numeric("transport_charges", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  loadingCharges: numeric("loading_charges", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  otherCharges: numeric("other_charges", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  gstTotal: numeric("gst_total", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  grandTotal: numeric("grand_total", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({
  id: true,
  purchaseNumber: true,
  createdAt: true,
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
