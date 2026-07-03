import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseEmployee(e: any) {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    phone: e.phone,
    email: e.email ?? null,
    address: e.address ?? null,
    role: e.role,
    department: e.department ?? null,
    salary: parseFloat(String(e.salary ?? "0")),
    status: e.status,
    joiningDate: e.joiningDate,
    notes: e.notes ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

function generateCode(id: number) {
  return `EMP${String(id).padStart(4, "0")}`;
}

router.get("/employees", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = parseInt(String(req.query.limit ?? "20"), 10);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const role = req.query.role as string | undefined;

  const conditions = [];
  if (search) conditions.push(ilike(employeesTable.name, `%${search}%`));
  if (role) conditions.push(eq(employeesTable.role, role));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(employeesTable).where(where);
  const rows = await db.select().from(employeesTable).where(where).orderBy(employeesTable.name).limit(limit).offset(offset);

  res.json({ data: rows.map(parseEmployee), total: countResult.count, page, limit });
});

router.post("/employees", async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [temp] = await db.insert(employeesTable).values({ ...parsed.data, employeeCode: "TEMP", salary: String(parsed.data.salary) } as any).returning();
  const [employee] = await db.update(employeesTable).set({ employeeCode: generateCode(temp.id) }).where(eq(employeesTable.id, temp.id)).returning();
  res.status(201).json(parseEmployee(employee));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, params.data.id));
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(parseEmployee(employee));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [employee] = await db.update(employeesTable).set(parsed.data as any).where(eq(employeesTable.id, params.data.id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(parseEmployee(employee));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [employee] = await db.delete(employeesTable).where(eq(employeesTable.id, params.data.id)).returning();
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
});

export default router;
