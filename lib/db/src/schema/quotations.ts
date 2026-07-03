import { pgTable, text, serial, timestamp, integer, numeric, jsonb, date, boolean } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const quotationsTable = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quotationNumber: text("quotation_number").notNull().unique(),
  // Existing customer (nullable when isNewCustomer = true)
  customerId: integer("customer_id").references(() => customersTable.id),
  // New (unregistered) customer fields
  isNewCustomer: boolean("is_new_customer").notNull().default(false),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerShopName: text("customer_shop_name"),
  customerEmail: text("customer_email"),
  customerLandline: text("customer_landline"),
  customerShopType: text("customer_shop_type"), // retail | wholesale | both
  customerGstAddress: text("customer_gst_address"),
  customerCity: text("customer_city"),
  customerState: text("customer_state"),
  // Quotation details
  type: text("type").notNull().default("gst"), // gst | non_gst
  date: date("date", { mode: "string" }).notNull(),
  transport: numeric("transport", { precision: 12, scale: 2 }).notNull().default("0"),
  packageCharge: numeric("package_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  otherCharge: numeric("other_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  items: jsonb("items").notNull().default("[]"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft | sent | accepted | rejected | expired
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Quotation = typeof quotationsTable.$inferSelect;
