import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, categoriesTable, productsTable, brandsTable } from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  GetCategoryParams,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function buildCategoryResponse(r: {
  id: number;
  name: string;
  brandId: number | null;
  storedBrandName: string | null;
  joinedBrandName: string | null;
  createdAt: Date;
  productsCount?: number;
}) {
  return {
    id: r.id,
    name: r.name,
    brandId: r.brandId,
    // Effective display name: joined brand name (existing brand) OR stored custom name (Other) OR null (No Brand)
    brandName: r.joinedBrandName ?? r.storedBrandName ?? null,
    productsCount: r.productsCount ?? 0,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/categories", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      brandId: categoriesTable.brandId,
      storedBrandName: categoriesTable.brandName,
      joinedBrandName: brandsTable.name,
      createdAt: categoriesTable.createdAt,
      productsCount: sql<number>`cast(count(${productsTable.id}) as int)`,
    })
    .from(categoriesTable)
    .leftJoin(brandsTable, eq(brandsTable.id, categoriesTable.brandId))
    .leftJoin(productsTable, eq(productsTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id, categoriesTable.brandId, categoriesTable.brandName, brandsTable.name)
    .orderBy(categoriesTable.name);
  res.json(rows.map(buildCategoryResponse));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Enforce mutual exclusivity: brandId clears brandName and vice versa
  const values: typeof parsed.data = { ...parsed.data };
  if (values.brandId) values.brandName = null;
  else if (values.brandName) values.brandId = null;

  const [cat] = await db.insert(categoriesTable).values(values as any).returning();
  res.status(201).json({
    id: cat.id,
    name: cat.name,
    brandId: cat.brandId,
    brandName: cat.brandName,
    productsCount: 0,
    createdAt: cat.createdAt.toISOString(),
  });
});

router.get("/categories/:id", async (req, res): Promise<void> => {
  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [row] = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      brandId: categoriesTable.brandId,
      storedBrandName: categoriesTable.brandName,
      joinedBrandName: brandsTable.name,
      createdAt: categoriesTable.createdAt,
    })
    .from(categoriesTable)
    .leftJoin(brandsTable, eq(brandsTable.id, categoriesTable.brandId))
    .where(eq(categoriesTable.id, params.data.id));

  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(buildCategoryResponse({ ...row, productsCount: 0 }));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Enforce mutual exclusivity on update
  const values: typeof parsed.data = { ...parsed.data };
  if (values.brandId) values.brandName = null;
  else if (values.brandName) values.brandId = null;

  const [cat] = await db.update(categoriesTable).set(values as any).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }

  // Re-fetch with brand join to get effective brandName
  const [row] = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      brandId: categoriesTable.brandId,
      storedBrandName: categoriesTable.brandName,
      joinedBrandName: brandsTable.name,
      createdAt: categoriesTable.createdAt,
    })
    .from(categoriesTable)
    .leftJoin(brandsTable, eq(brandsTable.id, categoriesTable.brandId))
    .where(eq(categoriesTable.id, cat.id));

  res.json(buildCategoryResponse({ ...row!, productsCount: 0 }));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [cat] = await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.sendStatus(204);
});

export default router;
