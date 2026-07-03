import { useState } from "react";
import { useListPayments, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { PaymentFormDialog } from "./payment-form-dialog";

const PAGE_SIZE = 20;

export function Payments() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const listParams = { search: search || undefined, page, limit: PAGE_SIZE };
  const { data, isLoading } = useListPayments(listParams, { query: { queryKey: getListPaymentsQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getMethodColor = (method: string) => {
    switch (method.toLowerCase()) {
      case 'cash': return "bg-emerald-100 text-emerald-700";
      case 'upi': return "bg-blue-100 text-blue-700";
      case 'card': return "bg-violet-100 text-violet-700";
      case 'bank': return "bg-indigo-100 text-indigo-700";
      case 'cheque': return "bg-amber-100 text-amber-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const getTypeInfo = (type: string) => {
    switch (type.toLowerCase()) {
      case 'received': return { icon: ArrowDownRight, color: 'text-green-600', label: 'Received' };
      case 'paid': return { icon: ArrowUpRight, color: 'text-amber-600', label: 'Paid' };
      case 'refund': return { icon: RefreshCcw, color: 'text-purple-600', label: 'Refund' };
      default: return { icon: ArrowDownRight, color: 'text-slate-600', label: type };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground mt-1">Track all incoming and outgoing payments.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>
      <Card>
        <div className="p-4 border-b flex gap-4 items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search by reference or entity..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-[100px]" /></TableCell><TableCell><Skeleton className="h-4 w-[150px]" /></TableCell><TableCell><Skeleton className="h-4 w-[200px]" /></TableCell><TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell><TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No payments found.</TableCell></TableRow>
              ) : data?.data?.map((payment) => {
                const typeInfo = getTypeInfo(payment.type);
                const TypeIcon = typeInfo.icon;
                return (
                  <TableRow key={payment.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(payment.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium font-mono text-sm">{payment.referenceNumber}</TableCell>
                    <TableCell>
                      <div className="font-medium">{payment.entityName}</div>
                      <div className="text-xs text-muted-foreground uppercase">{payment.entityType}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className={`uppercase text-[10px] tracking-wider ${getMethodColor(payment.method)}`}>{payment.method}</Badge></TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1.5 font-medium text-sm ${typeInfo.color}`}>
                        <TypeIcon className="h-4 w-4" /> {typeInfo.label}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-bold ${payment.type === 'received' ? 'text-green-600' : 'text-amber-600'}`}>
                      {payment.type === 'received' ? '+' : '-'}₹{payment.amount}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {data?.data?.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + (data?.data?.length ?? 0)} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
