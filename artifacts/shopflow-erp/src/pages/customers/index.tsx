import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListCustomers, useDeleteCustomer, getListCustomersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye, Filter, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { CustomerFormDialog } from "./customer-form-dialog";

const PAGE_SIZE = 20;

export function Customers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterMinOutstanding, setFilterMinOutstanding] = useState("");
  const [filterMaxOutstanding, setFilterMaxOutstanding] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const queryClient = useQueryClient();

  const listParams = {
    search: search || undefined,
    type: filterType || undefined,
    status: filterStatus || undefined,
    city: filterCity || undefined,
    state: filterState || undefined,
    minOutstanding: filterMinOutstanding ? parseFloat(filterMinOutstanding) : undefined,
    maxOutstanding: filterMaxOutstanding ? parseFloat(filterMaxOutstanding) : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading } = useListCustomers(listParams, { query: { queryKey: getListCustomersQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters = filterType || filterStatus || filterCity || filterState || filterMinOutstanding || filterMaxOutstanding || filterDateFrom || filterDateTo;

  function clearFilters() {
    setFilterType("");
    setFilterStatus("");
    setFilterCity("");
    setFilterState("");
    setFilterMinOutstanding("");
    setFilterMaxOutstanding("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  }

  const deleteMutation = useDeleteCustomer({
    mutation: {
      onSuccess: () => { toast.success("Customer deleted"); queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); setDeletingCustomer(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground mt-1">Manage retail and wholesale customers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowFilters(v => !v)}>
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && <Badge className="h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">!</Badge>}
          </Button>
          <Button className="shrink-0 gap-2" onClick={() => { setEditingCustomer(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>
      <Card>
        <div className="p-4 border-b space-y-3 bg-muted/20">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] sm:max-w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search customers..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 items-end pt-1">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Type</span>
                <Select value={filterType || "all"} onValueChange={(v) => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 w-32 bg-background text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Select value={filterStatus || "all"} onValueChange={(v) => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 w-32 bg-background text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">City</span>
                <Input placeholder="Filter by city" className="h-8 w-32 bg-background text-sm" value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">State</span>
                <Input placeholder="Filter by state" className="h-8 w-32 bg-background text-sm" value={filterState} onChange={(e) => { setFilterState(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Balance Min (₹)</span>
                <Input type="number" placeholder="0" className="h-8 w-28 bg-background text-sm" value={filterMinOutstanding} onChange={(e) => { setFilterMinOutstanding(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Balance Max (₹)</span>
                <Input type="number" placeholder="∞" className="h-8 w-28 bg-background text-sm" value={filterMaxOutstanding} onChange={(e) => { setFilterMaxOutstanding(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Joined From</span>
                <Input type="date" className="h-8 w-36 bg-background text-sm" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Joined To</span>
                <Input type="date" className="h-8 w-36 bg-background text-sm" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City / State</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-[200px]" /></TableCell><TableCell><Skeleton className="h-4 w-[150px]" /></TableCell><TableCell><Skeleton className="h-4 w-[100px]" /></TableCell><TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No customers found.</TableCell></TableRow>
              ) : data?.data?.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    <Link href={`/customers/${customer.id}`} className="hover:underline text-primary">{customer.name}</Link>
                    {(customer as any).shopName && <div className="text-xs text-muted-foreground font-normal mt-0.5">{(customer as any).shopName}</div>}
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">{customer.customerCode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.phone}</div>
                    {(customer as any).landlineNumber && <div className="text-xs text-muted-foreground">{(customer as any).landlineNumber}</div>}
                    {customer.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
                  </TableCell>
                  <TableCell>
                    {((customer as any).city || (customer as any).state) ? (
                      <div className="text-sm">{[(customer as any).city, (customer as any).state].filter(Boolean).join(", ")}</div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={customer.type === 'wholesale' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700'}>{customer.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={customer.outstanding && customer.outstanding > 0 ? "text-amber-600" : ""}>₹{Number(customer.outstanding || 0).toLocaleString('en-IN')}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'active' ? 'default' : 'secondary'} className={customer.status === 'active' ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>{customer.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/customers/${customer.id}`} className="cursor-pointer flex items-center"><Eye className="mr-2 h-4 w-4" /> View Details</Link></DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingCustomer(customer); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingCustomer(customer)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
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

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editingCustomer} />

      <AlertDialog open={!!deletingCustomer} onOpenChange={(open) => !open && setDeletingCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingCustomer?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this customer and all their data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingCustomer && deleteMutation.mutate({ id: deletingCustomer.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
