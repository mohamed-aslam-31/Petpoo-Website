import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useListCategories,
  useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, MoreHorizontal, Edit, Trash2, Package } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ProductFormDialog } from "./product-form-dialog";
import { StockAdjustDialog } from "./stock-adjust-dialog";

const PAGE_SIZE = 20;

export function Products() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const queryClient = useQueryClient();
  const { data: categories } = useListCategories();

  const listParams = {
    search: search || undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading } = useListProducts(listParams, {
    query: { queryKey: getListProductsQueryKey(listParams) },
  });

  const deleteMutation = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product deleted");
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setDeletingProduct(null);
      },
      onError: (err: any) => toast.error(err?.message ?? "Failed to delete product"),
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openAddDialog() {
    setEditingProduct(null);
    setFormOpen(true);
  }

  function openEditDialog(product: any) {
    setEditingProduct(product);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Manage your inventory, pricing, and stock levels.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={openAddDialog}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products by name or SKU..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={categoryId ?? "all"}
            onValueChange={(val) => {
              setCategoryId(val === "all" ? undefined : val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-56 gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      (data?.data?.length ?? 0) > 0 &&
                      data?.data?.every((p) => selectedIds.has(p.id))
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(new Set(data?.data?.map((p) => p.id) ?? []));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-[300px]">Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell>
                      <Skeleton className="h-3 w-16 mb-1.5" />
                      <Skeleton className="h-4 w-[200px] mb-1.5" />
                      <Skeleton className="h-3 w-14" />
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data?.map((product) => (
                  <TableRow
                    key={product.id}
                    className="hover:bg-muted/50 transition-colors"
                    data-state={selectedIds.has(product.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(product.id);
                            else next.delete(product.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${product.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono">
                        <span className="text-blue-600">{product.sku}</span>
                        {product.gstPercent != null && <span className="text-red-500"> · GST {product.gstPercent}%</span>}
                      </div>
                      <div className="font-medium">
                        {product.name}
                        {product.barcode && (
                          <span className="text-[11px] text-green-600 font-mono font-normal ml-1">({product.barcode})</span>
                        )}
                      </div>
                      {product.hsnCode && (
                        <div className="text-xs text-yellow-600 mt-0.5">HSN: {product.hsnCode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.brandName || "-"}</TableCell>
                    <TableCell>{product.categoryName || "-"}</TableCell>
                    <TableCell className="text-right">
                      <span className={product.currentStock <= product.minStock ? "text-red-600 font-bold" : ""}>
                        {product.currentStock} {product.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className={product.status === 'active' ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400" : ""}>
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openEditDialog(product)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => setAdjustingProduct(product)}>
                            <Package className="mr-2 h-4 w-4" /> Adjust Stock
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setDeletingProduct(product)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>
              Showing {data?.data?.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
              {(page - 1) * PAGE_SIZE + (data?.data?.length ?? 0)} of {total} products
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editingProduct} />
      <StockAdjustDialog open={!!adjustingProduct} onOpenChange={(v) => !v && setAdjustingProduct(null)} product={adjustingProduct} />

      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingProduct?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the product from your inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingProduct && deleteMutation.mutate({ id: deletingProduct.id })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
