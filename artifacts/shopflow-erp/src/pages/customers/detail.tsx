import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetCustomer,
  useGetCustomerLedger,
  useListInvoices,
  useListOrders,
  getListInvoicesQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  Phone, Mail, MapPin, CreditCard, ArrowLeft, Edit, Plus,
  TrendingUp, TrendingDown, IndianRupee, FileText, ShoppingCart,
} from "lucide-react";
import { PaymentFormDialog } from "../payments/payment-form-dialog";
import { CustomerFormDialog } from "./customer-form-dialog";

export function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id ? parseInt(params.id, 10) : 0;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: customer, isLoading: isLoadingCustomer } = useGetCustomer(customerId, {
    query: { enabled: !!customerId },
  });
  const { data: ledger, isLoading: isLoadingLedger } = useGetCustomerLedger(customerId, {
    query: { enabled: !!customerId },
  });
  const { data: invoicesData, isLoading: isLoadingInvoices } = useListInvoices(
    { customerId, limit: 50 },
    { query: { enabled: !!customerId, queryKey: getListInvoicesQueryKey({ customerId, limit: 50 }) } },
  );
  const { data: ordersData, isLoading: isLoadingOrders } = useListOrders(
    { search: customer?.name, limit: 50 },
    { query: { enabled: !!customer?.name, queryKey: getListOrdersQueryKey({ search: customer?.name, limit: 50 }) } },
  );

  if (isLoadingCustomer) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>;
  }
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Customer not found.</p>
        <Link href="/customers"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to Customers</Button></Link>
      </div>
    );
  }

  const totalDebits = ledger?.reduce((s, e) => s + (Number(e.debit) || 0), 0) ?? 0;
  const totalCredits = ledger?.reduce((s, e) => s + (Number(e.credit) || 0), 0) ?? 0;
  const paymentEntries = ledger?.filter((e) => e.type === "payment") ?? [];
  const invoiceCount = invoicesData?.total ?? 0;
  const orderCount = ordersData?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
              <Badge variant={customer.status === "active" ? "default" : "secondary"} className={customer.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>{customer.status}</Badge>
              <Badge variant="outline" className={customer.type === "wholesale" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-700"}>{customer.type}</Badge>
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{customer.customerCode}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4" /> Edit</Button>
          <Button size="sm" className="gap-2" onClick={() => setPaymentOpen(true)}><Plus className="h-4 w-4" /> Record Payment</Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Outstanding", value: `₹${Number(customer.outstanding || 0).toLocaleString()}`, icon: IndianRupee, color: customer.outstanding && customer.outstanding > 0 ? "text-amber-600" : "text-green-600", bg: customer.outstanding && customer.outstanding > 0 ? "bg-amber-50" : "bg-green-50" },
          { label: "Total Billed", value: `₹${totalDebits.toLocaleString()}`, icon: TrendingUp, color: "text-red-600", bg: "bg-red-50" },
          { label: "Total Received", value: `₹${totalCredits.toLocaleString()}`, icon: TrendingDown, color: "text-green-600", bg: "bg-green-50" },
          { label: "Credit Limit", value: `₹${Number(customer.creditLimit || 0).toLocaleString()}`, icon: CreditCard, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div>
                <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Contact Card */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div><div className="text-xs text-muted-foreground">Phone</div><div className="text-sm font-medium">{customer.phone}</div></div>
            </div>
            {customer.email && (
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">Email</div><div className="text-sm font-medium">{customer.email}</div></div>
              </div>
            )}
            {customer.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">Address</div><div className="text-sm font-medium">{customer.address}</div></div>
              </div>
            )}
            {customer.gstNumber && (
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div><div className="text-xs text-muted-foreground">GST Number</div><div className="text-sm font-mono uppercase">{customer.gstNumber}</div></div>
              </div>
            )}
            {customer.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm text-muted-foreground">{customer.notes}</div>
              </div>
            )}
            <div className="pt-2 border-t text-xs text-muted-foreground">
              Customer since {format(new Date(customer.createdAt), "MMM yyyy")}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="ledger">
            <TabsList className="mb-4">
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="invoices">Invoices {invoiceCount > 0 && <span className="ml-1.5 bg-muted rounded-full px-1.5 text-xs">{invoiceCount}</span>}</TabsTrigger>
              <TabsTrigger value="orders">Orders {orderCount > 0 && <span className="ml-1.5 bg-muted rounded-full px-1.5 text-xs">{orderCount}</span>}</TabsTrigger>
              <TabsTrigger value="payments">Payments {paymentEntries.length > 0 && <span className="ml-1.5 bg-muted rounded-full px-1.5 text-xs">{paymentEntries.length}</span>}</TabsTrigger>
            </TabsList>

            {/* Ledger Tab */}
            <TabsContent value="ledger">
              <Card>
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
                      )) : ledger?.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
                      ) : ledger?.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground whitespace-nowrap text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="font-medium">{entry.description}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] uppercase tracking-wider">{entry.type}</Badge></TableCell>
                          <TableCell className="text-right font-medium text-amber-700">{Number(entry.debit) > 0 ? `₹${Number(entry.debit).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-right font-medium text-green-700">{Number(entry.credit) > 0 ? `₹${Number(entry.credit).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className={`text-right font-bold ${Number(entry.balance) > 0 ? "text-amber-600" : "text-green-600"}`}>₹{Number(entry.balance).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Invoice No.</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total (₹)</TableHead>
                        <TableHead className="text-right">Paid (₹)</TableHead>
                        <TableHead className="text-right">Due (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingInvoices ? Array(3).fill(0).map((_, i) => (
                        <TableRow key={i}><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell></TableRow>
                      )) : invoicesData?.data?.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No invoices found.</TableCell></TableRow>
                      ) : invoicesData?.data?.map((inv) => (
                        <TableRow key={inv.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono font-medium text-primary text-sm">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(inv.createdAt), "MMM d, yyyy")}</TableCell>
                          <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{inv.type.replace("_", " ")}</Badge></TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${inv.status === "paid" ? "bg-green-100 text-green-700" : inv.status === "pending" ? "bg-amber-100 text-amber-700" : inv.status === "overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`} variant="secondary">{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">₹{Number(inv.total).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">₹{Number(inv.paidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className={`text-right font-bold ${Number(inv.dueAmount || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>₹{Number(inv.dueAmount || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Order No.</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total (₹)</TableHead>
                        <TableHead className="text-right">Paid (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingOrders ? Array(3).fill(0).map((_, i) => (
                        <TableRow key={i}><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell></TableRow>
                      )) : ordersData?.data?.filter((o) => o.customerName === customer.name)?.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No orders found.</TableCell></TableRow>
                      ) : ordersData?.data?.filter((o) => o.customerName === customer.name)?.map((order) => (
                        <TableRow key={order.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono font-medium text-primary text-sm">{order.orderNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(order.createdAt), "MMM d, yyyy")}</TableCell>
                          <TableCell><Badge variant="outline" className={order.type === "wholesale" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-700"}>{order.type}</Badge></TableCell>
                          <TableCell><Badge className={`text-xs ${order.status === "completed" ? "bg-green-100 text-green-700" : order.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`} variant="secondary">{order.status}</Badge></TableCell>
                          <TableCell className="text-right font-medium">₹{Number(order.total).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">₹{Number(order.paidAmount || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments">
              <Card>
                <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                  <div className="text-sm font-medium">Payment History</div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setPaymentOpen(true)}><Plus className="h-3 w-3" /> Record Payment</Button>
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit (₹)</TableHead>
                        <TableHead className="text-right">Credit (₹)</TableHead>
                        <TableHead className="text-right">Running Balance (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingLedger ? Array(3).fill(0).map((_, i) => (
                        <TableRow key={i}><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-48" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell></TableRow>
                      )) : paymentEntries.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No payments recorded yet.</TableCell></TableRow>
                      ) : paymentEntries.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground whitespace-nowrap text-sm">{format(new Date(entry.date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="font-medium">{entry.description}</TableCell>
                          <TableCell className="text-right font-medium text-amber-700">{Number(entry.debit) > 0 ? `₹${Number(entry.debit).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-right font-medium text-green-700">{Number(entry.credit) > 0 ? `₹${Number(entry.credit).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className={`text-right font-bold ${Number(entry.balance) > 0 ? "text-amber-600" : "text-green-600"}`}>₹{Number(entry.balance).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {paymentEntries.length > 0 && (
                    <div className="border-t p-4 flex justify-between items-center bg-muted/20">
                      <span className="text-sm font-medium text-muted-foreground">Total Received</span>
                      <span className="text-lg font-bold text-green-600">₹{paymentEntries.reduce((s, e) => s + (Number(e.credit) || 0), 0).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PaymentFormDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultEntityType="customer" defaultEntityId={customerId} />
      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer as any} />
    </div>
  );
}
