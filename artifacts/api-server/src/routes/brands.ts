import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, brandsTable, productsTable } from "@workspace/db";
import {
  CreateBrandBody,
  UpdateBrandBody,
  UpdateBrandParams,
  DeleteBrandParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/brands", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: brandsTable.id,
      name: brandsTable.name,
      createdAt: brandsTable.createdAt,
      productsCount: sql<number>`cast(count(${productsTable.id}) as int)`,
    })
    .from(brandsTable)
    .leftJoin(productsTable, eq(productsTable.brandId, brandsTable.id))
    .groupBy(brandsTable.id)
    .orderBy(brandsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/brands", async (req, res): Promise<void> => {
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [brand] = await db.insert(brandsTable).values(parsed.data).returning();
  res.status(201).json({ ...brand, productsCount: 0, createdAt: brand.createdAt.toISOString() });
});

router.patch("/brands/:id", async (req, res): Promise<void> => {
  const params = UpdateBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [brand] = await db.update(brandsTable).set(parsed.data).where(eq(brandsTable.id, params.data.id)).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json({ ...brand, productsCount: 0, createdAt: brand.createdAt.toISOString() });
});

router.delete("/brands/:id", async (req, res): Promise<void> => {
  const params = DeleteBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [brand] = await db.delete(brandsTable).where(eq(brandsTable.id, params.data.id)).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.sendStatus(204);
});

export default router;
