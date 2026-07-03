import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";
import {
  CreateExpenseBody,
  UpdateExpenseBody,
  GetExpenseParams,
  UpdateExpenseParams,
  DeleteExpenseParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseExpense(e: any) {
  return {
    id: e.id,
    title: e.title,
    amount: parseFloat(String(e.amount ?? "0")),
    category: e.category,
    date: e.date,
    status: e.status,
    description: e.description ?? null,
    paidBy: e.paidBy ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  const conditions = [];
  if (search) conditions.push(ilike(expensesTable.title, `%${search}%`));
  if (category) conditions.push(eq(expensesTable.category, category));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(expensesTable).where(where);
  const rows = await db.select().from(expensesTable).where(where).orderBy(sql`${expensesTable.date} desc`).limit(limit).offset(offset);

  res.json({ data: rows.map(parseExpense), total: countResult.count, page, limit });
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [expense] = await db.insert(expensesTable).values({ ...parsed.data, amount: String(parsed.data.amount) } as any).returning();
  res.status(201).json(parseExpense(expense));
});

router.get("/expenses/:id", async (req, res): Promise<void> => {
  const params = GetExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(parseExpense(expense));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [expense] = await db.update(expensesTable).set(parsed.data as any).where(eq(expensesTable.id, params.data.id)).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(parseExpense(expense));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [expense] = await db.delete(expensesTable).where(eq(expensesTable.id, params.data.id)).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.sendStatus(204);
});

export default router;
