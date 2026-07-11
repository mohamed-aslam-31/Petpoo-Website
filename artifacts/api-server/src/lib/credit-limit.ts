import { eq, and } from "drizzle-orm";
import { db, customersTable, invoicesTable, paymentsTable, creditNotesTable } from "@workspace/db";

export interface CreditStatus {
  creditLimit: number;
  outstanding: number;
  availableCredit: number;
  creditStatus: "within_limit" | "over_limit" | "no_limit";
}

export interface CreditCheckResult extends CreditStatus {
  allowed: boolean;
  newAmount: number;
  projectedOutstanding: number;
  excessAmount: number;
}

/**
 * Compute real-time outstanding for a customer:
 *   total active invoice amounts
 *   − invoice paidAmounts
 *   − customer-level payments
 *   − credit notes on active invoices
 *
 * "returned" invoices are excluded from debits entirely.
 * "cancelled" invoices stay in debits but their cancellation credit-note zeroes them out.
 * Pass `tx` to run inside an existing transaction.
 */
export async function computeOutstanding(customerId: number, tx?: any): Promise<number> {
  const dbOrTx = tx ?? db;

  const invoices = await dbOrTx
    .select({
      id: invoicesTable.id,
      total: invoicesTable.total,
      paidAmount: invoicesTable.paidAmount,
      status: invoicesTable.status,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.customerId, customerId));

  const activeInvoices = invoices.filter((i: any) => i.status !== "returned");

  const payments = await dbOrTx
    .select({ amount: paymentsTable.amount })
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.entityType, "customer"),
      eq(paymentsTable.entityId, customerId),
    ));

  const creditNotesRows = await dbOrTx
    .select({ amount: creditNotesTable.amount, invoiceId: creditNotesTable.invoiceId })
    .from(creditNotesTable)
    .where(eq(creditNotesTable.customerId, customerId));

  const activeInvoiceIdSet = new Set(activeInvoices.map((i: any) => i.id));
  const creditNotes = creditNotesRows.filter((c: any) => activeInvoiceIdSet.has(c.invoiceId));

  const totalDebits = activeInvoices.reduce((s: number, i: any) => s + parseFloat(String(i.total ?? "0")), 0);
  const totalCredits =
    activeInvoices.reduce((s: number, i: any) => s + parseFloat(String(i.paidAmount ?? "0")), 0) +
    payments.reduce((s: number, p: any) => s + parseFloat(String(p.amount ?? "0")), 0) +
    creditNotes.reduce((s: number, c: any) => s + parseFloat(String(c.amount ?? "0")), 0);

  return Math.max(0, parseFloat((totalDebits - totalCredits).toFixed(2)));
}

/**
 * Check whether adding `newAmount` to the customer's current outstanding balance
 * would exceed their credit limit.  Returns a full breakdown for use in
 * 422 error responses and frontend warnings.
 *
 * When creditLimit === 0, enforcement is disabled (unlimited) — `allowed` is always true.
 */
export async function checkCreditLimit(
  customerId: number,
  newAmount: number,
  tx?: any,
): Promise<CreditCheckResult> {
  const dbOrTx = tx ?? db;

  const [customer] = await dbOrTx
    .select({ creditLimit: customersTable.creditLimit })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));

  const creditLimit = parseFloat(String(customer?.creditLimit ?? "0"));
  const outstanding = await computeOutstanding(customerId, tx);
  const projectedOutstanding = parseFloat((outstanding + newAmount).toFixed(2));
  const availableCredit = parseFloat(Math.max(0, creditLimit - outstanding).toFixed(2));

  // creditLimit === 0 → unlimited
  if (creditLimit <= 0) {
    return {
      allowed: true,
      creditLimit,
      outstanding,
      availableCredit: 0,
      creditStatus: "no_limit",
      newAmount,
      projectedOutstanding,
      excessAmount: 0,
    };
  }

  const exceeded = projectedOutstanding > creditLimit;
  const excessAmount = exceeded ? parseFloat((projectedOutstanding - creditLimit).toFixed(2)) : 0;
  const creditStatus: "within_limit" | "over_limit" =
    outstanding > creditLimit ? "over_limit" : "within_limit";

  return {
    allowed: !exceeded,
    creditLimit,
    outstanding,
    availableCredit,
    creditStatus,
    newAmount,
    projectedOutstanding,
    excessAmount,
  };
}

/** Shared helper to build a 422 credit-limit-exceeded JSON body */
export function creditLimitErrorBody(check: CreditCheckResult) {
  return {
    error: "CREDIT_LIMIT_EXCEEDED",
    message: `Credit limit exceeded. Projected outstanding ₹${check.projectedOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} would exceed limit ₹${check.creditLimit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    creditLimit: check.creditLimit,
    outstanding: check.outstanding,
    availableCredit: check.availableCredit,
    newAmount: check.newAmount,
    projectedOutstanding: check.projectedOutstanding,
    excessAmount: check.excessAmount,
  };
}
