import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import categoriesRouter from "./categories";
import brandsRouter from "./brands";
import productsRouter from "./products";
import customersRouter from "./customers";
import suppliersRouter from "./suppliers";
import ordersRouter from "./orders";
import invoicesRouter from "./invoices";
import paymentsRouter from "./payments";
import employeesRouter from "./employees";
import expensesRouter from "./expenses";
import stockRouter from "./stock";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(categoriesRouter);
router.use(brandsRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(ordersRouter);
router.use(invoicesRouter);
router.use(paymentsRouter);
router.use(employeesRouter);
router.use(expensesRouter);
router.use(stockRouter);

export default router;
