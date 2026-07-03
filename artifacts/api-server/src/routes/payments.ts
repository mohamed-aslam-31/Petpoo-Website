import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, paymentsTable, customersTable, suppliersTable } from "@workspace/db";
import {
  CreatePaymentBody,
  GetPaymentParams,
  DeletePaymentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function generateRef(id: number) {
  return `PAY${String(id).padStart(6, "0")}`;
}

async function getEntityName(entityType: string, entityId: number): Promise<string> {
  if (entityType === "customer") {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, entityId));
    return c?.name ?? "Unknown";
  } else {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, entityId));
    return s?.name ?? "Unknown";
  }
}

function parsePayment(p: any, entityName?: string) {
  return {
    id: p.id,
    referenceNumber: p.referenceNumber,
    amount: parseFloat(String(p.amount ?? "0")),
    method: p.method,
    type: p.type,
    entityType: p.entityType,
    entityId: p.entityId,
    entityName: entityName ?? p.entityName ?? "",
    notes: p.notes ?? null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

router.get("/payments", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const type = req.query.type as string | undefined;

  const conditions = type ? [eq(paymentsTable.type, type)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(paymentsTable).where(where);
  const rows = await db.select().from(paymentsTable).where(where).orderBy(sql`${paymentsTable.createdAt} desc`).limit(limit).offset(offset);

  const data = await Promise.all(rows.map(async p => {
    const name = await getEntityName(p.entityType, p.entityId);
    return parsePayment(p, name);
  }));

  res.json({ data, total: countResult.count, page, limit });
});

router.post("/payments", async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [temp] = await db.insert(paymentsTable).values({ ...parsed.data, referenceNumber: "TEMP", amount: String(parsed.data.amount) } as any).returning();
  const [payment] = await db.update(paymentsTable).set({ referenceNumber: generateRef(temp.id) }).where(eq(paymentsTable.id, temp.id)).returning();

  const entityName = await getEntityName(payment.entityType, payment.entityId);
  res.status(201).json(parsePayment(payment, entityName));
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  const entityName = await getEntityName(payment.entityType, payment.entityId);
  res.json(parsePayment(payment, entityName));
});

router.delete("/payments/:id", async (req, res): Promise<void> => {
  const params = DeletePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [payment] = await db.delete(paymentsTable).where(eq(paymentsTable.id, params.data.id)).returning();
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.sendStatus(204);
});

export default router;
