import { Router, type IRouter } from "express";
import { eq, sql, ilike } from "drizzle-orm";
import { db, brandsTable, categoriesTable } from "@workspace/db";
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
      updatedAt: brandsTable.updatedAt,
      categoriesCount: sql<number>`cast(count(${categoriesTable.id}) as int)`,
    })
    .from(brandsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.brandId, brandsTable.id))
    .groupBy(brandsTable.id)
    .orderBy(brandsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
});

router.post("/brands", async (req, res): Promise<void> => {
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const trimmedName = parsed.data.name.trim();
  const [existing] = await db
    .select({ id: brandsTable.id, name: brandsTable.name })
    .from(brandsTable)
    .where(sql`lower(trim(${brandsTable.name})) = lower(trim(${trimmedName}))`)
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `Brand "${existing.name}" already exists. Duplicate brand names are not allowed.` });
    return;
  }

  const [brand] = await db.insert(brandsTable).values({ ...parsed.data, name: trimmedName }).returning();
  res.status(201).json({ ...brand, categoriesCount: 0, createdAt: brand.createdAt.toISOString() });
});

router.patch("/brands/:id", async (req, res): Promise<void> => {
  const params = UpdateBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.name) {
    const trimmedName = parsed.data.name.trim();
    const [existing] = await db
      .select({ id: brandsTable.id, name: brandsTable.name })
      .from(brandsTable)
      .where(sql`lower(trim(${brandsTable.name})) = lower(trim(${trimmedName})) and ${brandsTable.id} != ${params.data.id}`)
      .limit(1);
    if (existing) {
      res.status(409).json({ error: `Brand "${existing.name}" already exists. Duplicate brand names are not allowed.` });
      return;
    }
    parsed.data.name = trimmedName;
  }

  const [brand] = await db.update(brandsTable).set(parsed.data).where(eq(brandsTable.id, params.data.id)).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json({ ...brand, categoriesCount: 0, createdAt: brand.createdAt.toISOString() });
});

router.delete("/brands/:id", async (req, res): Promise<void> => {
  const params = DeleteBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  // Check for linked categories before deleting
  const linkedCategories = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name })
    .from(categoriesTable)
    .where(eq(categoriesTable.brandId, params.data.id));
  if (linkedCategories.length > 0) {
    const names = linkedCategories.map(c => `"${c.name}"`).join(", ");
    res.status(409).json({
      error: `This brand is used by ${linkedCategories.length} categor${linkedCategories.length === 1 ? "y" : "ies"}: ${names}. Clear the categor${linkedCategories.length === 1 ? "y's" : "ies'"} brand first, then delete.`,
      linkedCategories: linkedCategories.map(c => ({ id: c.id, name: c.name })),
    });
    return;
  }

  const [brand] = await db.delete(brandsTable).where(eq(brandsTable.id, params.data.id)).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.sendStatus(204);
});

export default router;
