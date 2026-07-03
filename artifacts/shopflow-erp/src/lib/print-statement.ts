export interface StatementEntity {
  name: string;
  code: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  outstanding?: number;
  type?: "customer" | "supplier";
}

export interface StatementEntry {
  date: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export function printStatement(entity: StatementEntity, entries: StatementEntry[]) {
  const now = new Date();
  const printDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const printTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const totalDebit = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const closingBalance = entries.length > 0 ? Number(entries[entries.length - 1].balance) : 0;

  const formatAmount = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  const rows = entries.map((e) => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td>${e.description}</td>
      <td class="type-badge">${e.type}</td>
      <td class="num">${Number(e.debit) > 0 ? formatAmount(Number(e.debit)) : "—"}</td>
      <td class="num">${Number(e.credit) > 0 ? formatAmount(Number(e.credit)) : "—"}</td>
      <td class="num bal ${Number(e.balance) > 0 ? "debit-bal" : "credit-bal"}">${formatAmount(Number(e.balance))}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Statement of Account — ${entity.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 32px; }

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #1a56db; padding-bottom: 20px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 36px; height: 36px; background: #1a56db; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; }
    .brand-name { font-size: 20px; font-weight: 700; color: #1a56db; }
    .brand-sub { font-size: 11px; color: #64748b; margin-top: 1px; }
    .print-meta { text-align: right; font-size: 11px; color: #64748b; }
    .print-meta strong { display: block; font-size: 13px; color: #1a1a1a; }

    .statement-title { text-align: center; margin-bottom: 24px; }
    .statement-title h1 { font-size: 17px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #1e293b; }
    .statement-title p { font-size: 11px; color: #64748b; margin-top: 4px; }

    .entity-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .entity-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
    .entity-card h3 { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px; }
    .entity-card .entity-name { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .entity-card .entity-code { font-family: monospace; font-size: 11px; color: #64748b; margin-bottom: 8px; }
    .entity-card .entity-detail { font-size: 11px; color: #475569; line-height: 1.7; }
    .entity-card .gst { font-family: monospace; text-transform: uppercase; }

    .summary-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
    .summary-card h3 { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 10px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
    .summary-row:last-child { border-bottom: none; font-weight: 700; font-size: 13px; padding-top: 8px; }
    .debit-color { color: #b45309; }
    .credit-color { color: #16a34a; }
    .outstanding-color { color: #d97706; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #1e293b; color: white; }
    thead th { padding: 9px 10px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
    thead th.num { text-align: right; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 8px 10px; font-size: 11.5px; vertical-align: middle; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .type-badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 500; }
    .bal { font-weight: 600; }
    .debit-bal { color: #b45309; }
    .credit-bal { color: #16a34a; }

    tfoot tr { background: #1e293b; color: white; }
    tfoot td { padding: 9px 10px; font-weight: 600; font-size: 12px; }
    tfoot td.num { text-align: right; }

    .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-note { font-size: 10px; color: #94a3b8; }
    .signature-block { text-align: center; font-size: 11px; color: #475569; }
    .signature-line { width: 160px; border-top: 1px solid #94a3b8; margin-bottom: 4px; }

    @media print {
      body { padding: 16px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="brand">
      <div class="brand-icon">S</div>
      <div>
        <div class="brand-name">ShopFlow ERP</div>
        <div class="brand-sub">Wholesale & Retail Management</div>
      </div>
    </div>
    <div class="print-meta">
      <strong>Statement of Account</strong>
      Printed: ${printDate} at ${printTime}
    </div>
  </div>

  <div class="statement-title">
    <h1>Statement of Account</h1>
    <p>All transactions as of ${printDate}</p>
  </div>

  <div class="entity-section">
    <div class="entity-card">
      <h3>${entity.type === "supplier" ? "Supplier" : "Customer"} Details</h3>
      <div class="entity-name">${entity.name}</div>
      <div class="entity-code">${entity.code}</div>
      <div class="entity-detail">
        ${entity.phone ? `📞 ${entity.phone}` : ""}
        ${entity.email ? `<br>✉ ${entity.email}` : ""}
        ${entity.address ? `<br>📍 ${entity.address}` : ""}
        ${entity.gstNumber ? `<br>GST: <span class="gst">${entity.gstNumber}</span>` : ""}
      </div>
    </div>
    <div class="summary-card">
      <h3>Account Summary</h3>
      <div class="summary-row"><span>Total Transactions</span><span>${entries.length}</span></div>
      <div class="summary-row"><span>Total Debits (Billed)</span><span class="debit-color">₹${formatAmount(totalDebit)}</span></div>
      <div class="summary-row"><span>Total Credits (Received)</span><span class="credit-color">₹${formatAmount(totalCredit)}</span></div>
      <div class="summary-row"><span>Closing Balance</span><span class="outstanding-color">₹${formatAmount(closingBalance)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Type</th>
        <th class="num">Debit (₹)</th>
        <th class="num">Credit (₹)</th>
        <th class="num">Balance (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length > 0 ? rows : `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">No transactions found.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Totals</td>
        <td class="num">₹${formatAmount(totalDebit)}</td>
        <td class="num">₹${formatAmount(totalCredit)}</td>
        <td class="num">₹${formatAmount(closingBalance)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="footer-note">
      This is a computer-generated statement and does not require a signature.<br>
      Generated by ShopFlow ERP • ${printDate}
    </div>
    <div class="signature-block">
      <div class="signature-line"></div>
      Authorised Signatory
    </div>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function printSupplierStatement(
  entity: StatementEntity,
  payments: Array<{ id: number; createdAt: string; referenceNumber: string; method: string; type: string; amount: number }>
) {
  const entries: StatementEntry[] = [];
  let runningBalance = 0;
  for (const p of payments) {
    const isPaid = p.type === "paid";
    const amount = Number(p.amount) || 0;
    if (isPaid) {
      runningBalance += amount;
    } else {
      runningBalance -= amount;
    }
    entries.push({
      date: p.createdAt,
      description: `${p.type.charAt(0).toUpperCase() + p.type.slice(1)} via ${p.method.toUpperCase()} • Ref: ${p.referenceNumber}`,
      type: p.type,
      debit: isPaid ? amount : 0,
      credit: isPaid ? 0 : amount,
      balance: runningBalance,
    });
  }
  printStatement(entity, entries);
}
