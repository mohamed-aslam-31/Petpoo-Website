import { useState, useRef, useMemo, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, Filter, MoreHorizontal, Edit, Trash2, Package, ChevronsUpDown, Check, X, AlertCircle, Settings2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductFormDialog } from "./product-form-dialog";
import { StockAdjustDialog } from "./stock-adjust-dialog";
import { cn } from "@/lib/utils";
import { getMargins, saveMargins, type PriceMargins } from "@/lib/price-margins";

const PAGE_SIZE_PRESETS = [10, 20, 50, 100];

type SortKey = "az" | "za" | "new" | "old" | "stockAsc" | "stockDesc";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "A → Z" },
  { key: "za", label: "Z → A" },
  { key: "new", label: "Newest first" },
  { key: "old", label: "Oldest first" },
  { key: "stockAsc", label: "Stock: Min → Max" },
  { key: "stockDesc", label: "Stock: Max → Min" },
];

function sortKeyToParams(activeSorts: Set<SortKey>) {
  if (activeSorts.has("az")) return { sortBy: "name", sortOrder: "asc" };
  if (activeSorts.has("za")) return { sortBy: "name", sortOrder: "desc" };
  if (activeSorts.has("new")) return { sortBy: "createdAt", sortOrder: "desc" };
  if (activeSorts.has("old")) return { sortBy: "createdAt", sortOrder: "asc" };
  if (activeSorts.has("stockAsc")) return { sortBy: "currentStock", sortOrder: "asc" };
  if (activeSorts.has("stockDesc")) return { sortBy: "currentStock", sortOrder: "desc" };
  return {};
}

export function Products() {
  const [search, setSearch] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterNoCategory, setFilterNoCategory] = useState(false);
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<number>>(new Set());
  const [filterNoBrand, setFilterNoBrand] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [activeSorts, setActiveSorts] = useState<Set<SortKey>>(new Set());
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");

  // Per-popover search states
  const [catSearch, setCatSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [locSearch, setLocSearch] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null);
  const [deleteStockError, setDeleteStockError] = useState<{ stock: number; unit: string } | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteErrors, setBulkDeleteErrors] = useState<{ productId: number; productName: string; currentStock: number; unit: string }[]>([]);
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedProductMap, setSelectedProductMap] = useState<Map<number, any>>(new Map());

  // ── Profit-margin settings ─────────────────────────────────────────────────
  const [margins, setMargins] = useState<PriceMargins>(getMargins);
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [draftWholesale, setDraftWholesale] = useState(String(margins.wholesale));
  const [draftRetail,    setDraftRetail]    = useState(String(margins.retail));

  // Bulk price-update state
  const [bulkPriceConfirmOpen, setBulkPriceConfirmOpen] = useState(false);
  const [pendingMargins, setPendingMargins] = useState<PriceMargins | null>(null);
  const [bulkPriceUpdating, setBulkPriceUpdating] = useState(false);
  const [bulkPriceProgress, setBulkPriceProgress] = useState({ done: 0, total: 0 });

  function openMarginsPanel() {
    const m = getMargins();
    setDraftWholesale(String(m.wholesale));
    setDraftRetail(String(m.retail));
    setMarginsOpen(true);
  }

  function applyMargins() {
    const w = parseFloat(draftWholesale);
    const r = parseFloat(draftRetail);
    if (isNaN(w) || w < 0 || isNaN(r) || r < 0) return;
    const next = { wholesale: w, retail: r };
    saveMargins(next);
    setMargins(next);
    setMarginsOpen(false);
    setPendingMargins(next);
    setBulkPriceConfirmOpen(true);
  }

  async function updateAllProductPrices(next: PriceMargins) {
    setBulkPriceUpdating(true);
    setBulkPriceProgress({ done: 0, total: 0 });
    try {
      // Fetch all products in one shot (no filters)
      const res = await fetch("/api/products?limit=9999&page=1");
      const json = await res.json();
      const all: any[] = json.data ?? [];
      const eligible = all.filter(p => (p.purchasePrice ?? 0) > 0);
      setBulkPriceProgress({ done: 0, total: eligible.length });

      let updated = 0;
      let failed = 0;
      for (const product of eligible) {
        const pp = product.purchasePrice;
        const newWholesale = Math.round(pp * (1 + next.wholesale / 100) * 100) / 100;
        const newRetail    = Math.round(pp * (1 + next.retail    / 100) * 100) / 100;
        try {
          const r = await fetch(`/api/products/${product.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wholesalePrice: newWholesale,
              retailPrice:    newRetail,
              sellingPrice:   newRetail,
            }),
          });
          if (r.ok) updated++; else failed++;
        } catch {
          failed++;
        }
        setBulkPriceProgress(p => ({ ...p, done: p.done + 1 }));
      }

      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      if (failed === 0) {
        toast.success(`Updated prices for ${updated} product${updated !== 1 ? "s" : ""}`);
      } else {
        toast.warning(`${updated} updated, ${failed} failed`);
      }
    } catch {
      toast.error("Failed to fetch products for bulk update");
    } finally {
      setBulkPriceUpdating(false);
      setBulkPriceConfirmOpen(false);
      setPendingMargins(null);
    }
  }

  const queryClient = useQueryClient();
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: brands } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });

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
    ...(filterNoCategory && { noCategory: "true" }),
    ...(selectedBrandIds.size > 0 && { brandIds: [...selectedBrandIds].join(",") }),
    ...(filterNoBrand && { noBrand: "true" }),
    ...(selectedUnits.size > 0 && { units: [...selectedUnits].join(",") }),
    ...(selectedLocations.size > 0 && { locations: [...selectedLocations].join(",") }),
    ...(minStock !== "" && { minStock: Number(minStock) }),
    ...(maxStock !== "" && { maxStock: Number(maxStock) }),
    ...sortParams,
  };

  // Reset to page 1 when filters change
  const filterKey = `${search}|${minStock}|${maxStock}|${filterNoBrand}|${filterNoCategory}|${[...selectedCategoryIds].sort()}|${[...selectedBrandIds].sort()}|${[...selectedUnits].sort()}|${[...selectedLocations].sort()}|${[...activeSorts].sort()}`;
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
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedProducts = useMemo(() => [...selectedProductMap.values()], [selectedProductMap]);
  const unselectedProducts = useMemo(
    () => (data?.data ?? []).filter(product => !selectedIds.has(product.id)),
    [data, selectedIds],
  );
  const displayProducts = [...selectedProducts, ...unselectedProducts];

  const pageSizeOptions = useMemo(() => {
    const opts = PAGE_SIZE_PRESETS.filter(s => s <= total || s === 10);
    return opts.length ? opts : [10];
  }, [total]);

  function toggleSort(key: SortKey) {
    setActiveSorts(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); }
      else {
        if (key === "az" || key === "za") { next.delete("az"); next.delete("za"); }
        if (key === "new" || key === "old") { next.delete("new"); next.delete("old"); }
        if (key === "stockAsc" || key === "stockDesc") { next.delete("stockAsc"); next.delete("stockDesc"); }
        next.add(key);
      }
      return next;
    });
  }

  function toggleNum(setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) {
    setter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleStr(setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) {
    setter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }

  async function deleteSelectedProducts() {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let deleted = 0;
    const errors: { productId: number; productName: string; currentStock: number; unit: string }[] = [];

    for (const id of ids) {
      const product = selectedProductMap.get(id);
      try {
        await new Promise<void>((resolve, reject) =>
          deleteMutation.mutate({ id }, { onSuccess: () => resolve(), onError: (error: any) => reject(error) })
        );
        deleted++;
      } catch (error: any) {
        const stock = error?.data?.currentStock;
        if (error?.status === 409 && stock !== undefined) {
          errors.push({ productId: id, productName: product?.name ?? `Product #${id}`, currentStock: stock, unit: product?.unit ?? "pcs" });
        } else {
          toast.error(`Failed to delete "${product?.name ?? `Product #${id}`}"`, {
            description: error?.data?.error ?? error?.message ?? "Please try again.",
          });
        }
      }
    }

    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    if (deleted > 0) toast.success(`${deleted} product${deleted === 1 ? "" : "s"} deleted`);

    if (errors.length > 0) {
      setBulkDeleteErrors(errors);
    } else {
      setDeletingSelected(false);
      setSelectedIds(new Set());
      setSelectedProductMap(new Map());
    }
  }


  // Filtered option lists for each popover
  const filteredCategories = useMemo(() => {
    const q = catSearch.toLowerCase();
    return q ? (categories ?? []).filter(c => c.name.toLowerCase().includes(q)) : (categories ?? []);
  }, [categories, catSearch]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.toLowerCase();
    return q ? (brands ?? []).filter(b => b.name.toLowerCase().includes(q)) : (brands ?? []);
  }, [brands, brandSearch]);

  const filteredUnits = useMemo(() => {
    const q = unitSearch.toLowerCase();
    const all = productOptions?.units ?? [];
    return q ? all.filter(u => u.toLowerCase().includes(q)) : all;
  }, [productOptions, unitSearch]);

  const filteredLocations = useMemo(() => {
    const q = locSearch.toLowerCase();
    const all = productOptions?.locations ?? [];
    return q ? all.filter(l => l.toLowerCase().includes(q)) : all;
  }, [productOptions, locSearch]);

  const catFilterActive = selectedCategoryIds.size > 0 || filterNoCategory;
  const brandFilterActive = selectedBrandIds.size > 0 || filterNoBrand;
  const unitFilterActive = selectedUnits.size > 0;
  const locFilterActive = selectedLocations.size > 0;
  const stockFilterActive = minStock !== "" || maxStock !== "";

  // Table checkbox helpers
  const allChecked = (data?.data?.length ?? 0) > 0 && data?.data?.every(p => selectedIds.has(p.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Manage your inventory, pricing, and stock levels.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setDeletingSelected(true)}>
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          {/* Profit margin settings */}
          <Popover open={marginsOpen} onOpenChange={setMarginsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                title="Profit margin settings"
                onClick={openMarginsPanel}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Profit Margin Settings</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applied automatically when you enter a purchase price.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Wholesale Margin %</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="25"
                        className="h-8 text-sm"
                        value={draftWholesale}
                        onChange={e => setDraftWholesale(e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">% markup</span>
                    </div>
                    {draftWholesale !== "" && !isNaN(parseFloat(draftWholesale)) && parseFloat(draftWholesale) >= 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        e.g. ₹200 purchase → ₹{(200 * (1 + parseFloat(draftWholesale) / 100)).toFixed(2)} wholesale
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Retail Margin %</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="50"
                        className="h-8 text-sm"
                        value={draftRetail}
                        onChange={e => setDraftRetail(e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">% markup</span>
                    </div>
                    {draftRetail !== "" && !isNaN(parseFloat(draftRetail)) && parseFloat(draftRetail) >= 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        e.g. ₹200 purchase → ₹{(200 * (1 + parseFloat(draftRetail) / 100)).toFixed(2)} retail
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setMarginsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={applyMargins}
                    disabled={
                      isNaN(parseFloat(draftWholesale)) || parseFloat(draftWholesale) < 0 ||
                      isNaN(parseFloat(draftRetail))    || parseFloat(draftRetail)    < 0
                    }
                  >
                    Save
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground border-t pt-2">
                  Current: Wholesale {margins.wholesale}% · Retail {margins.retail}%
                </p>
              </div>
            </PopoverContent>
          </Popover>

          <Button className="gap-2" onClick={() => { setEditingProduct(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <Card>
        {/* Toolbar */}
        <div className="p-4 border-b flex flex-wrap gap-3 items-center bg-muted/20">

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, SKU, HSN or barcode..."
              className="pl-9 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Sort */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 min-w-[160px] justify-between gap-2 font-normal">
                <span className="truncate text-xs text-left">
                  {activeSorts.size === 0
                    ? <span className="text-muted-foreground">Sort by...</span>
                    : SORT_OPTIONS.filter(o => activeSorts.has(o.key)).map(o => o.label).join(", ")
                  }
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              {SORT_OPTIONS.map(({ key, label }) => (
                <button key={key} type="button" onClick={() => toggleSort(key)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                  <Check className={cn("h-3.5 w-3.5 shrink-0", activeSorts.has(key) ? "opacity-100 text-primary" : "opacity-0")} />
                  {label}
                </button>
              ))}
              {activeSorts.size > 0 && (
                <>
                  <div className="my-1 border-t" />
                  <button type="button" onClick={() => setActiveSorts(new Set())}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    Clear sort
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>

          {/* Stock range filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Stock
                {stockFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">on</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3" align="start">
              <p className="text-xs font-semibold mb-3">Stock Range</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Min</label>
                  <Input type="number" min={0} placeholder="0" className="h-7 text-xs" value={minStock} onChange={e => setMinStock(e.target.value)} />
                </div>
                <span className="text-muted-foreground text-xs mt-4">–</span>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Max</label>
                  <Input type="number" min={0} placeholder="∞" className="h-7 text-xs" value={maxStock} onChange={e => setMaxStock(e.target.value)} />
                </div>
              </div>
              {stockFilterActive && (
                <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs w-full" onClick={() => { setMinStock(""); setMaxStock(""); }}>
                  Clear filter
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {/* Category filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Category
                {catFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedCategoryIds.size + (filterNoCategory ? 1 : 0)}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search categories..." className="pl-7 h-7 text-xs" value={catSearch} onChange={e => setCatSearch(e.target.value)} />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                <button type="button" onClick={() => setFilterNoCategory(v => !v)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                  <Check className={cn("h-3.5 w-3.5 shrink-0", filterNoCategory ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="truncate text-muted-foreground">No Category</span>
                </button>
                {filteredCategories.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-3">No categories found</p>
                  : filteredCategories.map(c => (
                    <button key={c.id} type="button" onClick={() => toggleNum(setSelectedCategoryIds, c.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Check className={cn("h-3.5 w-3.5 shrink-0", selectedCategoryIds.has(c.id) ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))
                }
              </div>
              {catFilterActive && (
                <div className="border-t p-1">
                  <button type="button" onClick={() => { setSelectedCategoryIds(new Set()); setFilterNoCategory(false); setCatSearch(""); }}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Brand filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Brand
                {brandFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedBrandIds.size + (filterNoBrand ? 1 : 0)}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search brands..." className="pl-7 h-7 text-xs" value={brandSearch} onChange={e => setBrandSearch(e.target.value)} />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                <button type="button" onClick={() => setFilterNoBrand(v => !v)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                  <Check className={cn("h-3.5 w-3.5 shrink-0", filterNoBrand ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="truncate text-muted-foreground">No Brand</span>
                </button>
                {filteredBrands.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-3">No brands found</p>
                  : filteredBrands.map(b => (
                    <button key={b.id} type="button" onClick={() => toggleNum(setSelectedBrandIds, b.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Check className={cn("h-3.5 w-3.5 shrink-0", selectedBrandIds.has(b.id) ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="truncate">{b.name}</span>
                    </button>
                  ))
                }
              </div>
              {brandFilterActive && (
                <div className="border-t p-1">
                  <button type="button" onClick={() => { setSelectedBrandIds(new Set()); setFilterNoBrand(false); setBrandSearch(""); }}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Unit filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Unit
                {unitFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedUnits.size}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search units..." className="pl-7 h-7 text-xs" value={unitSearch} onChange={e => setUnitSearch(e.target.value)} />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {filteredUnits.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-3">No units found</p>
                  : filteredUnits.map(u => (
                    <button key={u} type="button" onClick={() => toggleStr(setSelectedUnits, u)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Check className={cn("h-3.5 w-3.5 shrink-0", selectedUnits.has(u) ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="truncate">{u}</span>
                    </button>
                  ))
                }
              </div>
              {unitFilterActive && (
                <div className="border-t p-1">
                  <button type="button" onClick={() => { setSelectedUnits(new Set()); setUnitSearch(""); }}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Location filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Location
                {locFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedLocations.size}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search locations..." className="pl-7 h-7 text-xs" value={locSearch} onChange={e => setLocSearch(e.target.value)} />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {filteredLocations.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-3">No locations found</p>
                  : filteredLocations.map(l => (
                    <button key={l} type="button" onClick={() => toggleStr(setSelectedLocations, l)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                      <Check className={cn("h-3.5 w-3.5 shrink-0", selectedLocations.has(l) ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="truncate">{l}</span>
                    </button>
                  ))
                }
              </div>
              {locFilterActive && (
                <div className="border-t p-1">
                  <button type="button" onClick={() => { setSelectedLocations(new Set()); setLocSearch(""); }}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors">
                    Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Clear all filters */}
          {(search !== "" || activeSorts.size > 0 || stockFilterActive || catFilterActive || brandFilterActive || unitFilterActive || locFilterActive) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("");
                setActiveSorts(new Set());
                setMinStock(""); setMaxStock("");
                setSelectedCategoryIds(new Set()); setFilterNoCategory(false); setCatSearch("");
                setSelectedBrandIds(new Set()); setFilterNoBrand(false); setBrandSearch("");
                setSelectedUnits(new Set()); setUnitSearch("");
                setSelectedLocations(new Set()); setLocSearch("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear all filters
            </Button>
          )}
        </div>

        <CardContent className="px-4 py-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={checked => {
                      if (checked) {
                        const currentProducts = data?.data ?? [];
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          currentProducts.forEach(product => next.add(product.id));
                          return next;
                        });
                        setSelectedProductMap(prev => {
                          const next = new Map(prev);
                          currentProducts.forEach(product => next.set(product.id, product));
                          return next;
                        });
                      } else {
                        setSelectedIds(new Set());
                        setSelectedProductMap(new Map());
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
              ) : displayProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                displayProducts.map((product, index) => (
                  <TableRow
                    key={product.id}
                    className={cn(
                      "hover:bg-muted/50 transition-colors",
                      selectedIds.has(product.id) && "bg-primary/5",
                      selectedIds.has(product.id) &&
                        !selectedIds.has(displayProducts[index + 1]?.id ?? -1) &&
                        "border-b-2 border-primary/20",
                    )}
                    data-state={selectedIds.has(product.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={checked => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(product.id); else next.delete(product.id);
                            return next;
                          });
                          setSelectedProductMap(prev => {
                            const next = new Map(prev);
                            if (checked) next.set(product.id, product); else next.delete(product.id);
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
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <span className="shrink-0">
                Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} products
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editingProduct} />
      <StockAdjustDialog open={!!adjustingProduct} onOpenChange={v => !v && setAdjustingProduct(null)} product={adjustingProduct} />

      {/* Single delete */}
      <AlertDialog open={!!deletingProduct} onOpenChange={open => { if (!open) { setDeletingProduct(null); setDeleteStockError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="font-medium text-foreground/80 break-all mb-1">"{deletingProduct?.name}"</p>
                {!deleteStockError && (
                  <>
                    <p>This will permanently remove this product.</p>
                    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm flex items-start gap-2 text-amber-800 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Deleting this product will also permanently delete <strong>all stock movements</strong> and <strong>every transaction history</strong> associated with it. This cannot be undone.</span>
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
            {deleteStockError && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                <div className="flex items-start gap-2 text-destructive font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>This product has <strong>{deleteStockError.stock} {deleteStockError.unit}</strong> in stock.</span>
                </div>
                <p className="ml-6 text-muted-foreground">
                  Use <strong>Adjust Stock</strong> to bring stock to 0, then delete.
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {deleteStockError ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {!deleteStockError && (
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!deletingProduct) return;
                  deleteMutation.mutate(
                    { id: deletingProduct.id },
                    {
                      onSuccess: () => {
                        const id = deletingProduct.id;
                        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
                        setSelectedProductMap(prev => { const n = new Map(prev); n.delete(id); return n; });
                        setDeletingProduct(null);
                        setDeleteStockError(null);
                        toast.success("Product deleted");
                      },
                      onError: (e: any) => {
                        const stock = e?.data?.currentStock;
                        if (e?.status === 409 && stock !== undefined) {
                          setDeleteStockError({ stock, unit: deletingProduct?.unit ?? "pcs" });
                        } else {
                          toast.error(e?.data?.error ?? e?.message ?? "Failed to delete");
                        }
                      },
                    }
                  );
                }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog open={deletingSelected} onOpenChange={open => {
        if (!open && !bulkDeleting) {
          setDeletingSelected(false);
          setBulkDeleteErrors([]);
          if (bulkDeleteErrors.length === 0) { setSelectedIds(new Set()); setSelectedProductMap(new Map()); }
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            {bulkDeleteErrors.length === 0 ? (
              <>
                <AlertDialogDescription>
                  The following product{selectedIds.size > 1 ? "s" : ""} will be permanently removed:
                </AlertDialogDescription>
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-muted/40 divide-y text-sm">
                  {selectedProducts.map(product => (
                    <li key={product.id} className="flex items-start gap-2 px-3 py-2">
                      <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/70 mt-0.5" />
                      <span className="font-medium break-all">{product.name}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Deleting these products will also permanently delete <strong>all stock movements</strong> and <strong>every transaction history</strong> associated with them. This cannot be undone.</span>
                </div>
              </>
            ) : (
              <div className="mt-2 space-y-3">
                <AlertDialogDescription>
                  Some products could not be deleted. Use <strong>Adjust Stock</strong> to bring their stock to 0, then try again.
                </AlertDialogDescription>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {bulkDeleteErrors.map(err => (
                    <div key={err.productName} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-start gap-2 text-destructive font-medium min-w-0">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="break-all">"{err.productName}" has {err.currentStock} {err.unit} in stock.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>
              {bulkDeleteErrors.length > 0 ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {bulkDeleteErrors.length === 0 && (
              <Button variant="destructive" disabled={bulkDeleting} onClick={deleteSelectedProducts}>
                {bulkDeleting ? "Deleting..." : "Delete All"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk price-update confirmation */}
      <AlertDialog
        open={bulkPriceConfirmOpen}
        onOpenChange={open => { if (!open && !bulkPriceUpdating) { setBulkPriceConfirmOpen(false); setPendingMargins(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply new margins to all products?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Wholesale and retail prices for every product will be recalculated
                  from their purchase price using the new margins:
                </p>
                <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Wholesale</span>
                    <p className="font-semibold text-foreground">{pendingMargins?.wholesale ?? 0}% markup</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Retail</span>
                    <p className="font-semibold text-foreground">{pendingMargins?.retail ?? 0}% markup</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Products with a purchase price of ₹0 will be skipped. You can
                  still edit individual prices manually after this update.
                </p>
                {bulkPriceUpdating && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Updating prices…</span>
                      <span>{bulkPriceProgress.done} / {bulkPriceProgress.total}</span>
                    </div>
                    <Progress
                      value={bulkPriceProgress.total > 0 ? (bulkPriceProgress.done / bulkPriceProgress.total) * 100 : 0}
                      className="h-1.5"
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPriceUpdating}>
              Skip — settings only
            </AlertDialogCancel>
            <Button
              disabled={bulkPriceUpdating}
              onClick={() => pendingMargins && updateAllProductPrices(pendingMargins)}
            >
              {bulkPriceUpdating ? "Updating…" : "Update all products"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
