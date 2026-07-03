import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListOrders, useDeleteOrder, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { OrderFormDialog } from "./order-form-dialog";

const PAGE_SIZE = 20;

export function Orders() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const listParams = { search: search || undefined, type: tab === "all" ? undefined : tab, page, limit: PAGE_SIZE };
  const { data, isLoading } = useListOrders(listParams, { query: { queryKey: getListOrdersQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteMutation = useDeleteOrder({
    mutation: {
      onSuccess: () => { toast.success("Order deleted"); queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); setDeletingOrder(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-700 hover:bg-green-100';
      case 'pending': return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
      case 'cancelled': return 'bg-red-100 text-red-700 hover:bg-red-100';
      case 'returned': return 'bg-purple-100 text-purple-700 hover:bg-purple-100';
      default: return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground mt-1">Manage customer orders and fulfillments.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Create Order
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col gap-4">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }} className="w-full">
            <TabsList>
              <TabsTrigger value="all">All Orders</TabsTrigger>
              <TabsTrigger value="retail">Retail</TabsTrigger>
              <TabsTrigger value="wholesale">Wholesale</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search by order number or customer..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No orders found.</TableCell></TableRow>
              ) : data?.data?.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium text-primary">{order.orderNumber}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(order.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={order.type === 'wholesale' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700'}>{order.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(order.status)} variant="secondary">{order.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">₹{order.total}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingOrder(order)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
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

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <AlertDialog open={!!deletingOrder} onOpenChange={(open) => !open && setDeletingOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order "{deletingOrder?.orderNumber}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this order.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingOrder && deleteMutation.mutate({ id: deletingOrder.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
