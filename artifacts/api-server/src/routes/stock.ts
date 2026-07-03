import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, stockMovementsTable, productsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stock-movements", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = (page - 1) * limit;
  const productId = req.query.productId ? parseInt(String(req.query.productId), 10) : undefined;

  const where = productId ? eq(stockMovementsTable.productId, productId) : undefined;

  const rows = await db
    .select({
      id: stockMovementsTable.id,
      productId: stockMovementsTable.productId,
      productName: productsTable.name,
      type: stockMovementsTable.type,
      quantity: stockMovementsTable.quantity,
      beforeStock: stockMovementsTable.beforeStock,
      afterStock: stockMovementsTable.afterStock,
      reason: stockMovementsTable.reason,
      notes: stockMovementsTable.notes,
      createdBy: stockMovementsTable.createdBy,
      createdAt: stockMovementsTable.createdAt,
    })
    .from(stockMovementsTable)
    .leftJoin(productsTable, eq(productsTable.id, stockMovementsTable.productId))
    .where(where)
    .orderBy(sql`${stockMovementsTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    productName: r.productName ?? "Unknown",
    createdAt: r.createdAt.toISOString(),
  })));
});

export default router;
