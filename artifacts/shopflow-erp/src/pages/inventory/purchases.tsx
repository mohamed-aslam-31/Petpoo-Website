import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListPurchases,
  useDeletePurchase,
  getListPurchasesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, Eye, ShoppingBag, FileText, Pencil, X } from "lucide-react";

const PURCHASE_DRAFT_KEY = "shopflow_purchase_draft";

function formatCurrency(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Purchases() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    setHasDraft(!!localStorage.getItem(PURCHASE_DRAFT_KEY));
  }, []);

  const discardDraft = () => {
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
    setHasDraft(false);
    toast.success("Draft discarded");
  };

  const { data, isLoading } = useListPurchases({ search: search || undefined, page, limit: 20 });

  const deleteMutation = useDeletePurchase({
    mutation: {
      onSuccess: () => {
        toast.success("Purchase deleted and stock reversed");
        queryClient.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
        setDeleteId(null);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  const purchases = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Record supplier stock purchases — inventory is updated automatically.
          </p>
        </div>
        <Button onClick={() => setLocation("/inventory/purchases/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>

      {/* Draft banner */}
      {hasDraft && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-800 dark:text-amber-200 font-medium">
              You have an unsaved purchase draft
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200 dark:border-amber-700"
              onClick={() => setLocation("/inventory/purchases/new")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Resume Draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400"
              onClick={discardDraft}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by purchase number..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Purchase #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Grand Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading purchases…
                </TableCell>
              </TableRow>
            ) : purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-muted-foreground">No purchases yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/inventory/purchases/new")}
                    >
                      Record your first purchase
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-medium text-primary">
                    {p.purchaseNumber}
                  </TableCell>
                  <TableCell>{p.purchaseDate}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{p.items.length}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(p.subtotal)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.gstTotal)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(p.grandTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLocation(`/inventory/purchases/${p.id}`)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(p.id)}
                        title="Delete (reverses stock)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} total purchases</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the purchase record and <strong>reverse all stock increases</strong> that were applied when it was created.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete & Reverse Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
