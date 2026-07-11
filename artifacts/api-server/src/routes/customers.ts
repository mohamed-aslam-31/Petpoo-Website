import { Router, type IRouter } from "express";
import { eq, ilike, and, sql, gte, lte } from "drizzle-orm";
import { db, customersTable, invoicesTable, paymentsTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  DeleteCustomerParams,
  GetCustomerLedgerParams,
} from "@workspace/api-zod";
import { isDwollaConfigured, createDwollaCustomer, getCustomerDwollaBalance } from "../dwolla";
import { computeOutstanding } from "../lib/credit-limit";

const router: IRouter = Router();

function parseCustomer(c: any) {
  return {
    id: c.id,
    customerCode: c.customerCode,
    name: c.name,
    phone: c.phone,
    email: c.email ?? null,
    address: c.address ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    shopName: c.shopName ?? null,
    landlineNumber: c.landlineNumber ?? null,
    gstNumber: c.gstNumber ?? null,
    creditLimit: parseFloat(c.creditLimit ?? "0"),
    outstanding: parseFloat(c.outstanding ?? "0"),
    type: c.type,
    status: c.status,
    notes: c.notes ?? null,
    dwollaCustomerId: c.dwollaCustomerId ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

function generateCode(prefix: string, id: number) {
  return `${prefix}${String(id).padStart(4, "0")}`;
}

router.get("/customers", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const city = req.query.city as string | undefined;
  const state = req.query.state as string | undefined;
  const minOutstanding = req.query.minOutstanding ? parseFloat(String(req.query.minOutstanding)) : undefined;
  const maxOutstanding = req.query.maxOutstanding ? parseFloat(String(req.query.maxOutstanding)) : undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [];
  if (search) conditions.push(ilike(customersTable.name, `%${search}%`));
  if (type) conditions.push(eq(customersTable.type, type));
  if (status) conditions.push(eq(customersTable.status, status));
  if (city) conditions.push(ilike(customersTable.city, `%${city}%`));
  if (state) conditions.push(ilike(customersTable.state, `%${state}%`));
  if (dateFrom) conditions.push(gte(customersTable.createdAt, new Date(dateFrom)));
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(customersTable.createdAt, to));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(customersTable).where(where);
  const rows = await db.select().from(customersTable).where(where).orderBy(customersTable.name).limit(limit).offset(offset);

  let data = await Promise.all(
    rows.map(async (row) => ({
      ...parseCustomer(row),
      outstanding: await computeOutstanding(row.id),
    })),
  );

  // Apply outstanding range filter after computing
  if (minOutstanding !== undefined) data = data.filter(c => c.outstanding >= minOutstanding);
  if (maxOutstanding !== undefined) data = data.filter(c => c.outstanding <= maxOutstanding);

  res.json({ data, total: countResult.count, page, limit });
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [temp] = await db.insert(customersTable).values({ ...parsed.data, customerCode: "TEMP" } as any).returning();
  const [customer] = await db.update(customersTable).set({ customerCode: generateCode("CUST", temp.id) }).where(eq(customersTable.id, temp.id)).returning();
  res.status(201).json(parseCustomer(customer));
});

router.get("/customers/dwolla-status", async (_req, res): Promise<void> => {
  res.json({ configured: isDwollaConfigured() });
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const outstanding = await computeOutstanding(params.data.id);
  res.json({ ...parseCustomer(customer), outstanding });
});

router.get("/customers/:id/credit-status", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db.select({ creditLimit: customersTable.creditLimit }).from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const creditLimit = parseFloat(String(customer.creditLimit ?? "0"));
  const outstanding = await computeOutstanding(params.data.id);
  const availableCredit = creditLimit <= 0 ? 0 : parseFloat(Math.max(0, creditLimit - outstanding).toFixed(2));
  const creditStatus: "within_limit" | "over_limit" | "no_limit" =
    creditLimit <= 0 ? "no_limit" : outstanding > creditLimit ? "over_limit" : "within_limit";

  res.json({ creditLimit, outstanding, availableCredit, creditStatus });
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [customer] = await db.update(customersTable).set(parsed.data as any).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(parseCustomer(customer));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db.delete(customersTable).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.sendStatus(204);
});

router.get("/customers/:id/ledger", async (req, res): Promise<void> => {
  const params = GetCustomerLedgerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.customerId, params.data.id)).orderBy(invoicesTable.createdAt);
  const payments = await db.select().from(paymentsTable).where(and(eq(paymentsTable.entityType, "customer"), eq(paymentsTable.entityId, params.data.id))).orderBy(paymentsTable.createdAt);

  const entries: any[] = [];

  invoices.forEach(i => {
    if (i.status === "returned") {
      entries.push({ id: `invoice-${i.id}`, date: i.createdAt.toISOString(), description: `Invoice #${i.invoiceNumber} (Returned)`, debit: 0, credit: 0, balance: 0, type: "invoice", referenceId: i.id });
      return;
    }
    const invoiceTotal = parseFloat(String(i.total ?? "0"));
    const paid = parseFloat(String(i.paidAmount ?? "0"));
    entries.push({ id: `invoice-${i.id}`, date: i.createdAt.toISOString(), description: `Invoice #${i.invoiceNumber}`, debit: invoiceTotal, credit: 0, balance: 0, type: "invoice", referenceId: i.id });
    if (paid > 0) entries.push({ id: `invoice-pay-${i.id}`, date: i.updatedAt.toISOString(), description: `Payment at invoice #${i.invoiceNumber} (${i.paymentMethod ?? "cash"})`, debit: 0, credit: paid, balance: 0, type: "payment", referenceId: i.id });
  });

  payments.forEach(p => {
    entries.push({ id: p.id, date: p.createdAt.toISOString(), description: `Payment - ${p.method}${p.notes ? ` (${p.notes})` : ""}`, debit: 0, credit: parseFloat(String(p.amount ?? "0")), balance: 0, type: "payment", referenceId: p.id });
  });

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let balance = 0;
  entries.forEach(e => {
    balance = balance + e.debit - e.credit;
    e.balance = parseFloat(balance.toFixed(2));
  });

  res.json(entries);
});

router.post("/customers/:id/link-dwolla", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!isDwollaConfigured()) {
    res.status(503).json({ error: "Dwolla is not configured. Set DWOLLA_CLIENT_ID, DWOLLA_CLIENT_SECRET, and DWOLLA_ENV in your environment secrets." });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  if (customer.dwollaCustomerId) {
    res.status(409).json({ error: "Customer is already linked to Dwolla", dwollaCustomerId: customer.dwollaCustomerId });
    return;
  }

  if (!customer.email) {
    res.status(422).json({ error: "Customer must have an email address to link to Dwolla" });
    return;
  }

  const dwollaCustomerId = await createDwollaCustomer({ name: customer.name, email: customer.email });
  const [updated] = await db
    .update(customersTable)
    .set({ dwollaCustomerId } as any)
    .where(eq(customersTable.id, params.data.id))
    .returning();

  const outstanding = await computeOutstanding(params.data.id);
  res.json({ ...parseCustomer(updated), outstanding });
});

router.get("/customers/:id/balance", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  if (!isDwollaConfigured()) {
    res.status(503).json({ error: "Dwolla is not configured. Set DWOLLA_CLIENT_ID, DWOLLA_CLIENT_SECRET, and DWOLLA_ENV in your environment secrets." });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  if (!customer.dwollaCustomerId) {
    res.json({ linked: false, balance: null });
    return;
  }

  const balance = await getCustomerDwollaBalance(customer.dwollaCustomerId);
  res.json({ linked: true, balance });
});

export default router;
