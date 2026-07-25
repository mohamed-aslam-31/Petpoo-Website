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
import { Plus, Search, Trash2, Eye, ShoppingBag, Pencil } from "lucide-react";

export const PURCHASE_DRAFT_KEY = "shopflow_purchase_draft";

type DraftMeta = {
  date: string;
  supplierName: string;
  itemCount: number;
};

function readDraftMeta(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(PURCHASE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { values?: { purchaseDate?: string; items?: unknown[]; supplierName?: string } };
    return {
      date: parsed.values?.purchaseDate ?? "—",
      supplierName: parsed.values?.supplierName ?? "—",
      itemCount: parsed.values?.items?.length ?? 0,
    };
  } catch {
    return null;
  }
}

function formatCurrency(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Purchases() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [draft, setDraft] = useState<DraftMeta | null>(null);

  useEffect(() => {
    setDraft(readDraftMeta());
  }, []);

  const handleNewPurchase = () => {
    // Always open a blank form — clear any existing draft first
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
    setDraft(null);
    setLocation("/inventory/purchases/new");
  };

  const confirmDiscardDraft = () => {
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
    setDraft(null);
    setDiscardDraftOpen(false);
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

  const showEmptyState = !isLoading && purchases.length === 0 && !draft;

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
        <Button onClick={handleNewPurchase} className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>

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
            ) : (
              <>
                {/* Draft row — always first */}
                {draft && (
                  <TableRow className="bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                    <TableCell>
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 font-mono">
                        DRAFT
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{draft.date}</TableCell>
                    <TableCell className="text-muted-foreground">{draft.supplierName}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{draft.itemCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-700"
                          onClick={() => setLocation("/inventory/purchases/new")}
                        >
                          <Pencil className="h-3 w-3" />
                          Continue
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDiscardDraftOpen(true)}
                          title="Discard draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Saved purchases */}
                {purchases.map((p) => (
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
                ))}

                {/* Empty state */}
                {showEmptyState && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-muted-foreground">No purchases yet</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleNewPurchase}
                        >
                          Record your first purchase
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
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

      {/* Delete purchase confirm */}
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

      {/* Discard draft confirm */}
      <AlertDialog open={discardDraftOpen} onOpenChange={setDiscardDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your unsaved purchase draft. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Draft</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDiscardDraft}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
