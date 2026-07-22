import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListProducts,
  useListCategories,
  useListBrands,
  useDeleteProduct,
  getListProductsQueryKey,
  getListBrandsQueryKey,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Package, ChevronsUpDown, Check, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductFormDialog } from "./product-form-dialog";
import { StockAdjustDialog } from "./stock-adjust-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type SortKey = "az" | "za" | "new" | "old";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "A → Z" },
  { key: "za", label: "Z → A" },
  { key: "new", label: "Newest first" },
  { key: "old", label: "Oldest first" },
];

function sortKeyToParams(activeSorts: Set<SortKey>) {
  if (activeSorts.has("az")) return { sortBy: "name", sortOrder: "asc" };
  if (activeSorts.has("za")) return { sortBy: "name", sortOrder: "desc" };
  if (activeSorts.has("new")) return { sortBy: "createdAt", sortOrder: "desc" };
  if (activeSorts.has("old")) return { sortBy: "createdAt", sortOrder: "asc" };
  return {};
}

// ── Reusable multi-select popover ─────────────────────────────────────────────
interface MultiSelectOption { value: string; label: string }

function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const active = selected.size > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 min-w-[140px] justify-between gap-2 font-normal", active && "border-primary/60 bg-primary/5")}
        >
          <span className="truncate text-xs text-left">
            {active
              ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-primary font-medium">{label}</span>
                  <Badge variant="secondary" className="px-1.5 h-4 text-[10px]">{selected.size}</Badge>
                </span>
              )
              : <span className="text-muted-foreground">All {label}</span>
            }
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {/* Search input */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="pl-7 h-8 text-xs"
          />
        </div>
        {/* Options list */}
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No results</p>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <div className={cn(
                  "h-4 w-4 rounded-sm border flex items-center justify-center shrink-0",
                  selected.has(opt.value) ? "bg-primary border-primary" : "border-muted-foreground/40"
                )}>
                  {selected.has(opt.value) && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </button>
            ))
          )}
        </div>
        {/* Clear */}
        {active && (
          <>
            <div className="my-1.5 border-t" />
            <button
              type="button"
              onClick={() => { onClear(); setSearch(""); }}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
            >
              <X className="h-3 w-3" /> Clear selection
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Sort popover (same style as brands/categories) ────────────────────────────
function SortFilter({
  activeSorts,
  onToggle,
  onClear,
}: {
  activeSorts: Set<SortKey>;
  onToggle: (k: SortKey) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 min-w-[140px] justify-between gap-2 font-normal", activeSorts.size > 0 && "border-primary/60 bg-primary/5")}
        >
          <span className="truncate text-xs text-left">
            {activeSorts.size === 0
              ? <span className="text-muted-foreground">Sort by…</span>
              : <span className="text-primary font-medium">{SORT_OPTIONS.filter(o => activeSorts.has(o.key)).map(o => o.label).join(", ")}</span>
            }
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Check className={cn("h-3.5 w-3.5 shrink-0", activeSorts.has(key) ? "opacity-100 text-primary" : "opacity-0")} />
            {label}
          </button>
        ))}
        {activeSorts.size > 0 && (
          <>
            <div className="my-1 border-t" />
            <button
              type="button"
              onClick={onClear}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
            >
              <X className="h-3 w-3" /> Clear sort
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Products() {
  const [search, setSearch] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [activeSorts, setActiveSorts] = useState<Set<SortKey>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const PAGE_SIZE_PRESETS = [10, 20, 50, 100];

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const queryClient = useQueryClient();
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: brands } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });

  // Fetch distinct units + locations from the new /products/options endpoint
  const { data: productOptions } = useQuery<{ units: string[]; locations: string[] }>({
    queryKey: ["products-options"],
    queryFn: () => fetch("/api/products/options").then(r => r.json()),
    staleTime: 60_000,
  });

  const sortParams = sortKeyToParams(activeSorts);

  const listParams: any = {
    search: search || undefined,
    page,
    limit: pageSize,
    ...(selectedCategoryIds.size > 0 && { categoryIds: [...selectedCategoryIds].join(",") }),
    ...(selectedBrandIds.size > 0 && { brandIds: [...selectedBrandIds].join(",") }),
    ...(selectedUnits.size > 0 && { units: [...selectedUnits].join(",") }),
    ...(selectedLocations.size > 0 && { locations: [...selectedLocations].join(",") }),
    ...sortParams,
  };

  // Reset to page 1 when filters change
  const filterKey = `${search}|${[...selectedCategoryIds].sort()}|${[...selectedBrandIds].sort()}|${[...selectedUnits].sort()}|${[...selectedLocations].sort()}|${[...activeSorts].sort()}`;
  const prevFilterKey = useRef("");
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Page size options
  const pageSizeOptions = useMemo(() => {
    const opts = PAGE_SIZE_PRESETS.filter(s => s <= total || s === 10);
    return opts.length ? opts : [10];
  }, [total]);

  function toggleSort(key: SortKey) {
    setActiveSorts(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (key === "az" || key === "za") { next.delete("az"); next.delete("za"); }
        if (key === "new" || key === "old") { next.delete("new"); next.delete("old"); }
        next.add(key);
      }
      return next;
    });
  }

  function toggleStringSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  const categoryOptions: MultiSelectOption[] = (categories ?? []).map(c => ({ value: String(c.id), label: c.name }));
  const brandOptions: MultiSelectOption[] = (brands ?? []).map(b => ({ value: String(b.id), label: b.name }));
  const unitOptions: MultiSelectOption[] = (productOptions?.units ?? []).map(u => ({ value: u, label: u }));
  const locationOptions: MultiSelectOption[] = (productOptions?.locations ?? []).map(l => ({ value: l, label: l }));

  const anyFilterActive = selectedCategoryIds.size > 0 || selectedBrandIds.size > 0 || selectedUnits.size > 0 || selectedLocations.size > 0;

  function clearAllFilters() {
    setSelectedCategoryIds(new Set());
    setSelectedBrandIds(new Set());
    setSelectedUnits(new Set());
    setSelectedLocations(new Set());
    setActiveSorts(new Set());
    setSearch("");
  }

  // Checkbox helpers
  const allChecked = (data?.data?.length ?? 0) > 0 && data?.data?.every((p) => selectedIds.has(p.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Manage your inventory, pricing, and stock levels.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => { setEditingProduct(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <Card>
        {/* Toolbar */}
        <div className="p-4 border-b space-y-3 bg-muted/20">
          {/* Row 1: search */}
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, SKU, HSN or barcode..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Row 2: filters + sort */}
          <div className="flex flex-wrap gap-2 items-center">
            <MultiSelectFilter
              label="Categories"
              options={categoryOptions}
              selected={selectedCategoryIds}
              onToggle={v => toggleStringSet(setSelectedCategoryIds, v)}
              onClear={() => setSelectedCategoryIds(new Set())}
            />
            <MultiSelectFilter
              label="Brands"
              options={brandOptions}
              selected={selectedBrandIds}
              onToggle={v => toggleStringSet(setSelectedBrandIds, v)}
              onClear={() => setSelectedBrandIds(new Set())}
            />
            <MultiSelectFilter
              label="Units"
              options={unitOptions}
              selected={selectedUnits}
              onToggle={v => toggleStringSet(setSelectedUnits, v)}
              onClear={() => setSelectedUnits(new Set())}
            />
            <MultiSelectFilter
              label="Location"
              options={locationOptions}
              selected={selectedLocations}
              onToggle={v => toggleStringSet(setSelectedLocations, v)}
              onClear={() => setSelectedLocations(new Set())}
            />

            {/* Divider */}
            <div className="h-6 w-px bg-border mx-1" />

            <SortFilter
              activeSorts={activeSorts}
              onToggle={toggleSort}
              onClear={() => setActiveSorts(new Set())}
            />

            {/* Clear all */}
            {(anyFilterActive || activeSorts.size > 0 || search) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground gap-1" onClick={clearAllFilters}>
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
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
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data?.map((product) => (
                  <TableRow
                    key={product.id}
                    className={cn("hover:bg-muted/50 transition-colors", selectedIds.has(product.id) && "bg-primary/5")}
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
                          <span className="text-[11px] text-green-700 font-mono font-normal ml-1.5 bg-green-100 px-0.5 py-px rounded-sm">{product.barcode}</span>
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
                      <Badge
                        variant={product.status === "active" ? "default" : "secondary"}
                        className={product.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400" : ""}
                      >
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
                          <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingProduct(product); setFormOpen(true); }}>
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

          {/* Pagination footer */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-t text-sm text-muted-foreground bg-muted/20">
            <div className="flex items-center gap-2 shrink-0">
              <span className="shrink-0">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
              >
                <SelectTrigger className="h-8 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map(s => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <span className="shrink-0">
                Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} products
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
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
