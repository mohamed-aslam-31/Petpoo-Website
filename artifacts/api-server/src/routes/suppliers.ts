import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, suppliersTable, paymentsTable } from "@workspace/db";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  GetSupplierParams,
  UpdateSupplierParams,
  DeleteSupplierParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseSupplier(s: any) {
  return {
    id: s.id,
    supplierCode: s.supplierCode,
    name: s.name,
    phone: s.phone,
    email: s.email ?? null,
    address: s.address ?? null,
    gstNumber: s.gstNumber ?? null,
    outstanding: parseFloat(s.outstanding ?? "0"),
    status: s.status,
    notes: s.notes ?? null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

function generateCode(id: number) {
  return `SUPP${String(id).padStart(4, "0")}`;
}

router.get("/suppliers", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  const conditions = search ? [ilike(suppliersTable.name, `%${search}%`)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(suppliersTable).where(where);
  const rows = await db.select().from(suppliersTable).where(where).orderBy(suppliersTable.name).limit(limit).offset(offset);

  res.json({ data: rows.map(parseSupplier), total: countResult.count, page, limit });
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [temp] = await db.insert(suppliersTable).values({ ...parsed.data, supplierCode: "TEMP" } as any).returning();
  const [supplier] = await db.update(suppliersTable).set({ supplierCode: generateCode(temp.id) }).where(eq(suppliersTable.id, temp.id)).returning();
  res.status(201).json(parseSupplier(supplier));
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(parseSupplier(supplier));
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [supplier] = await db.update(suppliersTable).set(parsed.data as any).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(parseSupplier(supplier));
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [supplier] = await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.sendStatus(204);
});

router.get("/suppliers/:id/ledger", async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.entityType, "supplier"), eq(paymentsTable.entityId, params.data.id)))
    .orderBy(paymentsTable.createdAt);

  // From the business's perspective:
  //   "paid" = we paid the supplier  → credit (reduces what we owe)
  //   "received" = supplier paid us  → debit (unusual; e.g. a refund from supplier)
  const entries = payments.map((p) => ({
    id: p.id,
    date: p.createdAt.toISOString(),
    description: `Payment - ${p.method}${p.notes ? ` (${p.notes})` : ""}`,
    debit: p.type === "received" ? parseFloat(String(p.amount ?? "0")) : 0,
    credit: p.type === "paid" ? parseFloat(String(p.amount ?? "0")) : 0,
    balance: 0,
    type: "payment",
    referenceId: p.id,
  }));

  let balance = 0;
  for (const e of entries) {
    balance = parseFloat((balance + e.debit - e.credit).toFixed(2));
    e.balance = balance;
  }

  res.json(entries);
});

export default router;
