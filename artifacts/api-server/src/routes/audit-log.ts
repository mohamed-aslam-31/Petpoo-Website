import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";

const router: IRouter = Router();

function parseAuditLog(a: any) {
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    entityNumber: a.entityNumber ?? null,
    action: a.action,
    oldStatus: a.oldStatus ?? null,
    newStatus: a.newStatus ?? null,
    userLabel: a.userLabel,
    notes: a.notes ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

// GET /audit-log
router.get("/audit-log", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId ? parseInt(String(req.query.entityId), 10) : undefined;

  const conditions = [];
  if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
  if (entityId) conditions.push(eq(auditLogTable.entityId, entityId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(auditLogTable)
    .where(where);

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(where)
    .orderBy(sql`${auditLogTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json({ data: rows.map(parseAuditLog), total: countResult.count, page, limit });
});

export default router;
