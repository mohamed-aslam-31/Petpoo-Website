import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useDeleteInvoice,
  useUpdateInvoice,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MoreHorizontal, Trash2, Edit, Filter, X, CheckSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { InvoiceFormDialog } from "./invoice-form-dialog";

const PAGE_SIZE = 20;

const INVOICE_STATUSES = ["draft", "pending", "paid", "overdue", "cancelled"] as const;

export function Invoices() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  const queryClient = useQueryClient();

  const listParams = {
    search: search || undefined,
    status: filterStatus || undefined,
    type: filterType || undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading } = useListInvoices(listParams, { query: { queryKey: getListInvoicesQueryKey(listParams) } });

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = useMemo(() => invoices.map((i) => i.id), [invoices]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  const hasActiveFilters = filterStatus || filterType || filterDateFrom || filterDateTo;

  function clearFilters() {
    setFilterStatus("");
    setFilterType("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...pageIds]));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { toast.success("Invoice deleted"); invalidate(); setDeletingInvoice(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  const updateMutation = useUpdateInvoice({ mutation: {} });

  async function handleBulkStatusChange(status: string) {
    if (selectedIds.size === 0) return;
    setIsBulkWorking(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => updateMutation.mutateAsync({ id, data: { status } }))
      );
      toast.success(`${selectedIds.size} invoice${selectedIds.size > 1 ? "s" : ""} marked as ${status}`);
      clearSelection();
      invalidate();
    } catch {
      toast.error("Some updates failed");
    } finally {
      setIsBulkWorking(false);
    }
  }

  async function handleBulkDelete() {
    setIsBulkWorking(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => deleteMutation.mutateAsync({ id }))
      );
      toast.success(`${selectedIds.size} invoice${selectedIds.size > 1 ? "s" : ""} deleted`);
      clearSelection();
      invalidate();
    } catch {
      toast.error("Some deletes failed");
    } finally {
      setIsBulkWorking(false);
      setBulkDeleting(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "paid": return "bg-green-100 text-green-700 hover:bg-green-100";
      case "pending": return "bg-amber-100 text-amber-700 hover:bg-amber-100";
      case "overdue": return "bg-red-100 text-red-700 hover:bg-red-100";
      case "draft": return "bg-slate-100 text-slate-700 hover:bg-slate-100";
      case "cancelled": return "bg-slate-200 text-slate-500 hover:bg-slate-200";
      default: return "bg-slate-100 text-slate-700 hover:bg-slate-100";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Invoices</h2>
          <p className="text-muted-foreground mt-1">Manage billing, estimates, and quotations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && <Badge className="h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">!</Badge>}
          </Button>
          <Button className="shrink-0 gap-2" onClick={() => { setEditingInvoice(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Create Invoice
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b space-y-3 bg-muted/20">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px] sm:max-w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search by invoice no. or customer..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-1 items-end">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Select value={filterStatus || "all"} onValueChange={(v) => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 w-36 bg-background text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Type</span>
                <Select value={filterType || "all"} onValueChange={(v) => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="h-8 w-36 bg-background text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="gst">GST Invoice</SelectItem>
                    <SelectItem value="non_gst">Non-GST</SelectItem>
                    <SelectItem value="estimate">Estimate</SelectItem>
                    <SelectItem value="quotation">Quotation</SelectItem>
                    <SelectItem value="credit">Credit Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Date From</span>
                <Input type="date" className="h-8 w-36 bg-background text-sm" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Date To</span>
                <Input type="date" className="h-8 w-36 bg-background text-sm" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          )}

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span>{selectedIds.size} selected</span>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1" disabled={isBulkWorking}>
                      Set Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Change status to</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {INVOICE_STATUSES.map((s) => (
                      <DropdownMenuItem key={s} className="capitalize cursor-pointer" onClick={() => handleBulkStatusChange(s)}>
                        {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="destructive" size="sm" className="h-8 gap-1" disabled={isBulkWorking} onClick={() => setBulkDeleting(true)}>
                  <Trash2 className="h-3 w-3" />
                  Delete {selectedIds.size}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clearSelection}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    data-state={somePageSelected && !allPageSelected ? "indeterminate" : undefined}
                    onCheckedChange={toggleAll}
                    aria-label="Select all on page"
                    className={somePageSelected && !allPageSelected ? "opacity-60" : ""}
                  />
                </TableHead>
                <TableHead>Invoice No.</TableHead>
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
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell>
                </TableRow>
              )) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No invoices found.</TableCell></TableRow>
              ) : invoices.map((invoice) => {
                const isSelected = selectedIds.has(invoice.id);
                return (
                  <TableRow key={invoice.id} className={`hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(invoice.id)}
                        aria-label={`Select ${invoice.invoiceNumber}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-primary">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(invoice.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{invoice.type.replace("_", " ")}</Badge></TableCell>
                    <TableCell><Badge className={getStatusColor(invoice.status)} variant="secondary">{invoice.status}</Badge></TableCell>
                    <TableCell className="text-right font-medium">₹{Number(invoice.total).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingInvoice(invoice); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingInvoice(invoice)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {invoices.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + invoices.length} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <InvoiceFormDialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingInvoice(null); }} invoice={editingInvoice} />

      {/* Single delete dialog */}
      <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeletingInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice "{deletingInvoice?.invoiceNumber}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this invoice.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingInvoice && deleteMutation.mutate({ id: deletingInvoice.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleting} onOpenChange={(open) => !open && setBulkDeleting(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} invoice{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete all {selectedIds.size} selected invoices. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete} disabled={isBulkWorking}>
              {isBulkWorking ? "Deleting..." : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
