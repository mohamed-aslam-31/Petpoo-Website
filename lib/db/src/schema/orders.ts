import { pgTable, text, serial, timestamp, integer, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { quotationsTable } from "./quotations";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  status: text("status").notNull().default("pending"),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  notes: text("notes"),
  items: jsonb("items").notNull().default("[]"),
  /** Carries quotation-level data so the Complete Order dialog can pre-fill charges */
  meta: jsonb("meta"),
  /** 'quotation' | 'direct' — where this order originated from */
  createdFrom: text("created_from").notNull().default("direct"),
  /** Set when this order was auto-created from an accepted quotation */
  quotationId: integer("quotation_id").references(() => quotationsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, orderNumber: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
