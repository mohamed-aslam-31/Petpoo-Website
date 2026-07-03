import { Router, type IRouter } from "express";
import { sql, lte, gte, desc, ne } from "drizzle-orm";
import { db, productsTable, customersTable, suppliersTable, ordersTable, invoicesTable, expensesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [todaySalesResult] = await db
    .select({ total: sql<number>`coalesce(cast(sum(cast(total as numeric)) as float), 0)` })
    .from(invoicesTable)
    .where(sql`${invoicesTable.createdAt} >= ${todayStart} and ${invoicesTable.status} != 'returned'`);

  const [totalProducts] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(productsTable);

  const [pendingOrders] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(ordersTable)
    .where(sql`status = 'pending'`);

  const [pendingPaymentsResult] = await db
    .select({ total: sql<number>`coalesce(cast(sum(cast(total as numeric) - cast(paid_amount as numeric)) as float), 0)` })
    .from(invoicesTable)
    .where(sql`payment_status != 'paid' and status != 'returned'`);

  const [totalCustomers] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(customersTable);

  const [totalSuppliers] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(suppliersTable);

  const [stockValue] = await db
    .select({ value: sql<number>`coalesce(cast(sum(cast(purchase_price as numeric) * current_stock) as float), 0)` })
    .from(productsTable);

  const [lowStock] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(productsTable)
    .where(lte(productsTable.currentStock, productsTable.minStock));

  const [monthlyRevenue] = await db
    .select({ total: sql<number>`coalesce(cast(sum(cast(total as numeric)) as float), 0)` })
    .from(invoicesTable)
    .where(sql`${invoicesTable.createdAt} >= ${monthStart} and ${invoicesTable.status} != 'returned'`);

  res.json({
    todaySales: todaySalesResult.total ?? 0,
    totalProducts: totalProducts.count ?? 0,
    pendingOrders: pendingOrders.count ?? 0,
    pendingPayments: pendingPaymentsResult.total ?? 0,
    totalCustomers: totalCustomers.count ?? 0,
    stockValue: stockValue.value ?? 0,
    lowStockCount: lowStock.count ?? 0,
    totalSuppliers: totalSuppliers.count ?? 0,
    monthlyRevenue: monthlyRevenue.total ?? 0,
  });
});

router.get("/dashboard/sales-chart", async (req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      to_char(generate_series, 'YYYY-MM-DD') as date,
      COALESCE(SUM(CASE WHEN i.created_at::date = generate_series THEN CAST(i.total AS numeric) ELSE 0 END), 0) as sales
    FROM generate_series(
      CURRENT_DATE - INTERVAL '29 days',
      CURRENT_DATE,
      '1 day'::interval
    ) as generate_series
    LEFT JOIN invoices i ON i.created_at::date = generate_series AND i.status != 'returned'
    GROUP BY generate_series
    ORDER BY generate_series ASC
  `);

  const expenseRows = await db.execute(sql`
    SELECT
      to_char(generate_series, 'YYYY-MM-DD') as date,
      COALESCE(SUM(CASE WHEN e.date::date = generate_series THEN CAST(e.amount AS numeric) ELSE 0 END), 0) as purchases
    FROM generate_series(
      CURRENT_DATE - INTERVAL '29 days',
      CURRENT_DATE,
      '1 day'::interval
    ) as generate_series
    LEFT JOIN expenses e ON e.date::date = generate_series
    GROUP BY generate_series
    ORDER BY generate_series ASC
  `);

  const purchaseMap = new Map((expenseRows.rows as any[]).map(r => [r.date, parseFloat(r.purchases)]));

  res.json((rows.rows as any[]).map(r => ({
    date: r.date,
    sales: parseFloat(r.sales),
    purchases: purchaseMap.get(r.date) ?? 0,
    profit: parseFloat(r.sales) - (purchaseMap.get(r.date) ?? 0),
  })));
});

router.get("/dashboard/top-products", async (req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.name,
      c.name as category,
      COALESCE(SUM((item->>'quantity')::int), 0) as total_sold,
      COALESCE(SUM((item->>'total')::numeric), 0) as revenue
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN invoices i ON i.status != 'returned'
    LEFT JOIN LATERAL jsonb_array_elements(i.items) as item ON (item->>'productId')::int = p.id
    GROUP BY p.id, p.name, c.name
    ORDER BY total_sold DESC
    LIMIT 10
  `);

  res.json((rows.rows as any[]).map(r => ({
    id: r.id,
    name: r.name,
    category: r.category ?? "Uncategorized",
    totalSold: parseInt(r.total_sold),
    revenue: parseFloat(r.revenue),
  })));
});

router.get("/dashboard/recent-orders", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      customerName: customersTable.name,
    })
    .from(ordersTable)
    .leftJoin(customersTable, sql`${customersTable.id} = ${ordersTable.customerId}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  res.json(rows.map(r => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName ?? "Unknown",
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.get("/reports/sales", async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "monthly";

  let groupBy = "to_char(created_at, 'YYYY-MM')";
  if (period === "daily") groupBy = "to_char(created_at, 'YYYY-MM-DD')";
  if (period === "yearly") groupBy = "to_char(created_at, 'YYYY')";

  const rows = await db.execute(sql.raw(`
    SELECT
      ${groupBy} as period,
      CAST(SUM(CAST(total AS numeric)) AS float) as total_revenue,
      COUNT(*) as total_invoices,
      CAST(SUM(CAST(total AS numeric)) AS float) as total_sales,
      0 as total_profit
    FROM invoices
    WHERE status != 'returned'
    GROUP BY ${groupBy}
    ORDER BY ${groupBy} DESC
    LIMIT 12
  `));

  const orderRows = await db.execute(sql.raw(`
    SELECT ${groupBy} as period, COUNT(*) as total_orders
    FROM orders
    GROUP BY ${groupBy}
  `));
  const orderCountMap = new Map((orderRows.rows as any[]).map(r => [r.period, parseInt(r.total_orders ?? "0")]));

  res.json((rows.rows as any[]).map(r => ({
    period: r.period,
    totalSales: parseFloat(r.total_sales ?? "0"),
    totalOrders: orderCountMap.get(r.period) ?? 0,
    totalInvoices: parseInt(r.total_invoices ?? "0"),
    totalRevenue: parseFloat(r.total_revenue ?? "0"),
    totalProfit: parseFloat(r.total_profit ?? "0"),
  })));
});

router.get("/reports/profit-loss", async (req, res): Promise<void> => {
  const [revenue] = await db
    .select({ total: sql<number>`coalesce(cast(sum(cast(total as numeric)) as float), 0)` })
    .from(invoicesTable)
    .where(ne(invoicesTable.status, "returned"));

  const [expensesTotal] = await db
    .select({ total: sql<number>`coalesce(cast(sum(cast(amount as numeric)) as float), 0)` })
    .from(expensesTable);

  const expensesByCategory = await db.execute(sql`
    SELECT category, CAST(SUM(CAST(amount AS numeric)) AS float) as amount
    FROM expenses
    GROUP BY category
  `);

  const rev = revenue.total ?? 0;
  const exp = expensesTotal.total ?? 0;

  res.json({
    period: "All Time",
    revenue: rev,
    expenses: exp,
    grossProfit: rev,
    netProfit: rev - exp,
    breakdown: (expensesByCategory.rows as any[]).map(r => ({
      category: r.category,
      amount: parseFloat(r.amount),
    })),
  });
});

export default router;
