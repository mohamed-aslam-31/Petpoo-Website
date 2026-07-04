import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetSupplier,
  useGetSupplierLedger,
  getGetSupplierQueryKey,
  getGetSupplierLedgerQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  Phone, Mail, MapPin, CreditCard, ArrowLeft, Edit, Plus, Printer,
} from "lucide-react";
import { PaymentFormDialog } from "../payments/payment-form-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { printStatement } from "@/lib/print-statement";

export function SupplierDetail() {
  const [, params] = useRoute("/suppliers/:id");
  const supplierId = params?.id ? parseInt(params.id, 10) : 0;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: supplier, isLoading: isLoadingSupplier } = useGetSupplier(supplierId, {
    query: { enabled: !!supplierId, queryKey: getGetSupplierQueryKey(supplierId) },
  });
  const { data: ledger, isLoading: isLoadingLedger } = useGetSupplierLedger(supplierId, {
    query: { enabled: !!supplierId, queryKey: getGetSupplierLedgerQueryKey(supplierId) },
  });

  if (isLoadingSupplier) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>;
  }
  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Supplier not found.</p>
        <Link href="/suppliers"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Suppliers</Button></Link>
      </div>
    );
  }

  const totalPaid = (ledger ?? []).reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const totalReceived = (ledger ?? []).reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const currentBalance = ledger && ledger.length > 0 ? Number(ledger[ledger.length - 1].balance) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/suppliers">
            <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold tracking-tight">{supplier.name}</h2>
              <Badge variant={supplier.status === "active" ? "default" : "secondary"} className={supplier.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>{supplier.status}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{supplier.supplierCode}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => printStatement(
              { name: supplier.name, code: supplier.supplierCode, phone: supplier.phone, email: supplier.email ?? undefined, address: supplier.address ?? undefined, gstNumber: supplier.gstNumber ?? undefined, outstanding: Number(supplier.outstanding ?? 0), type: "supplier" },
              (ledger ?? []).map((e) => ({ date: e.date, description: e.description, type: e.type, debit: Number(e.debit), credit: Number(e.credit), balance: Number(e.balance) }))
            )}
          ><Printer className="h-4 w-4" /> Print Statement</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4" /> Edit</Button>
          <Button size="sm" className="gap-2" onClick={() => setPaymentOpen(true)}><Plus className="h-4 w-4" /> Record Payment</Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Net Balance", value: `₹${currentBalance.toLocaleString()}`, color: currentBalance > 0 ? "text-red-600" : "text-green-600", bg: currentBalance > 0 ? "bg-red-50" : "bg-green-50" },
          { label: "Total Paid Out", value: `₹${totalPaid.toLocaleString()}`, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Total Received", value: `₹${totalReceived.toLocaleString()}`, color: "text-green-600", bg: "bg-green-50" },
          { label: "Transactions", value: (ledger ?? []).length, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground font-medium mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Contact Info */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div><div className="text-xs text-muted-foreground">Phone</div><div className="text-sm font-medium">{supplier.phone}</div></div>
            </div>
            {supplier.email && (
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">Email</div><div className="text-sm font-medium">{supplier.email}</div></div>
              </div>
            )}
            {supplier.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">Address</div><div className="text-sm font-medium">{supplier.address}</div></div>
              </div>
            )}
            {supplier.gstNumber && (
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">GST Number</div><div className="text-sm font-mono uppercase">{supplier.gstNumber}</div></div>
              </div>
            )}
            {supplier.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm text-muted-foreground">{supplier.notes}</div>
              </div>
            )}
            <div className="pt-2 border-t text-xs text-muted-foreground">
              Supplier since {format(new Date(supplier.createdAt), "MMM yyyy")}
            </div>
          </CardContent>
        </Card>

        {/* Ledger Table */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ledger</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Running balance of all transactions with this supplier</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setPaymentOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit (₹)</TableHead>
                  <TableHead className="text-right">Credit (₹)</TableHead>
                  <TableHead className="text-right">Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingLedger ? Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-48" /></TableCell><TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell></TableRow>
                )) : !ledger || ledger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No transactions yet. Click "Record Payment" to add one.
                    </TableCell>
                  </TableRow>
                ) : ledger.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground whitespace-nowrap text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium text-sm">{entry.description}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase tracking-wider">{entry.type}</Badge></TableCell>
                    <TableCell className="text-right font-medium text-red-600">{Number(entry.debit) > 0 ? `₹${Number(entry.debit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right font-medium text-green-700">{Number(entry.credit) > 0 ? `₹${Number(entry.credit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className={`text-right font-bold ${Number(entry.balance) > 0 ? "text-amber-600" : "text-green-600"}`}>₹{Number(entry.balance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {ledger && ledger.length > 0 && (
              <div className="border-t p-4 flex items-center justify-between bg-muted/20">
                <div className="text-sm text-muted-foreground">{ledger.length} transaction{ledger.length !== 1 ? "s" : ""}</div>
                <div className="flex items-center gap-6 text-sm font-medium">
                  <span className="text-green-700">Paid Out: ₹{totalPaid.toLocaleString()}</span>
                  <span className="text-red-600">Received: ₹{totalReceived.toLocaleString()}</span>
                  <span className={currentBalance > 0 ? "text-amber-600" : "text-green-600"}>Net: ₹{currentBalance.toLocaleString()}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentFormDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultEntityType="supplier" defaultEntityId={supplierId} />
      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier as any} />
    </div>
  );
}
