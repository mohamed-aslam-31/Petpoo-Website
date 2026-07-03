import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListSuppliers, useDeleteSupplier, getListSuppliersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { SupplierFormDialog } from "./supplier-form-dialog";

const PAGE_SIZE = 20;

export function Suppliers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const listParams = { search: search || undefined, page, limit: PAGE_SIZE };
  const { data, isLoading } = useListSuppliers(listParams, { query: { queryKey: getListSuppliersQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteMutation = useDeleteSupplier({
    mutation: {
      onSuccess: () => { toast.success("Supplier deleted"); queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() }); setDeletingSupplier(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Suppliers</h2>
          <p className="text-muted-foreground mt-1">Manage vendor accounts and payables.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>
      <Card>
        <div className="p-4 border-b flex gap-4 items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search suppliers..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-[200px]" /></TableCell><TableCell><Skeleton className="h-4 w-[150px]" /></TableCell><TableCell><Skeleton className="h-4 w-[120px]" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No suppliers found.</TableCell></TableRow>
              ) : data?.data?.map((supplier) => (
                <TableRow key={supplier.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    <Link href={`/suppliers/${supplier.id}`} className="hover:underline text-primary">{supplier.name}</Link>
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">{supplier.supplierCode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{supplier.phone}</div>
                    {supplier.email && <div className="text-xs text-muted-foreground">{supplier.email}</div>}
                  </TableCell>
                  <TableCell className="uppercase text-sm">{supplier.gstNumber || "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={supplier.outstanding && supplier.outstanding > 0 ? "text-red-600" : ""}>₹{supplier.outstanding || 0}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'} className={supplier.status === 'active' ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>{supplier.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/suppliers/${supplier.id}`} className="cursor-pointer flex items-center"><Eye className="mr-2 h-4 w-4" /> View Details</Link></DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingSupplier(supplier); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingSupplier(supplier)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
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

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editingSupplier} />

      <AlertDialog open={!!deletingSupplier} onOpenChange={(open) => !open && setDeletingSupplier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingSupplier?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this supplier.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingSupplier && deleteMutation.mutate({ id: deletingSupplier.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
