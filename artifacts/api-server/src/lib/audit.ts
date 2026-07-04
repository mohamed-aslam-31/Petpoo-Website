import { db, auditLogTable } from "@workspace/db";

export type AuditEntityType = "quotation" | "order" | "invoice";

/**
 * Insert an audit trail entry. Accepts an optional `tx` (transaction handle)
 * so callers running inside `db.transaction(...)` keep the log write atomic
 * with the rest of the cascade.
 */
export async function logAudit(
  entry: {
    entityType: AuditEntityType;
    entityId: number;
    entityNumber?: string | null;
    action: string;
    oldStatus?: string | null;
    newStatus?: string | null;
    notes?: string | null;
  },
  tx: Pick<typeof db, "insert"> = db,
): Promise<void> {
  await tx.insert(auditLogTable).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityNumber: entry.entityNumber ?? null,
    action: entry.action,
    oldStatus: entry.oldStatus ?? null,
    newStatus: entry.newStatus ?? null,
    userLabel: "Demo User",
    notes: entry.notes ?? null,
  } as any);
}
