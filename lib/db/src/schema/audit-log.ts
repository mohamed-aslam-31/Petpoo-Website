import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Audit trail for status changes and CRUD operations across
 * Quotations, Orders, and Invoices. Logs who/when/old→new status.
 */
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // quotation | order | invoice
  entityId: integer("entity_id").notNull(),
  entityNumber: text("entity_number"),
  action: text("action").notNull(), // created | status_changed | deleted | cascaded_delete | cascaded_status
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  userLabel: text("user_label").notNull().default("Demo User"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
