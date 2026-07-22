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
import { Search, Plus, Filter, MoreHorizontal, Edit, Trash2, Package, ChevronsUpDown, Check, X } from "lucide-react";
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
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<number>>(new Set());
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
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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
    ...(selectedBrandIds.size > 0 && { brandIds: [...selectedBrandIds].join(",") }),
    ...(selectedUnits.size > 0 && { units: [...selectedUnits].join(",") }),
    ...(selectedLocations.size > 0 && { locations: [...selectedLocations].join(",") }),
    ...(minStock !== "" && { minStock: Number(minStock) }),
    ...(maxStock !== "" && { maxStock: Number(maxStock) }),
    ...sortParams,
  };

  // Reset to page 1 when filters change
  const filterKey = `${search}|${minStock}|${maxStock}|${[...selectedCategoryIds].sort()}|${[...selectedBrandIds].sort()}|${[...selectedUnits].sort()}|${[...selectedLocations].sort()}|${[...activeSorts].sort()}`;
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

  const catFilterActive = selectedCategoryIds.size > 0;
  const brandFilterActive = selectedBrandIds.size > 0;
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
        <Button className="shrink-0 gap-2" onClick={() => { setEditingProduct(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
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
                {catFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedCategoryIds.size}</Badge>}
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
                  <button type="button" onClick={() => { setSelectedCategoryIds(new Set()); setCatSearch(""); }}
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
                {brandFilterActive && <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedBrandIds.size}</Badge>}
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
                  <button type="button" onClick={() => { setSelectedBrandIds(new Set()); setBrandSearch(""); }}
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

          {/* Active category badges */}
          {catFilterActive && (
            <div className="flex flex-wrap gap-1">
              {[...selectedCategoryIds].map(id => {
                const cat = categories?.find(c => c.id === id);
                return cat ? (
                  <Badge key={id} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
                    {cat.name}
                    <button type="button" onClick={() => toggleNum(setSelectedCategoryIds, id)} className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
          )}

          {/* Active brand badges */}
          {brandFilterActive && (
            <div className="flex flex-wrap gap-1">
              {[...selectedBrandIds].map(id => {
                const brand = brands?.find(b => b.id === id);
                return brand ? (
                  <Badge key={id} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
                    {brand.name}
                    <button type="button" onClick={() => toggleNum(setSelectedBrandIds, id)} className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
          )}

          {/* Active unit badges */}
          {unitFilterActive && (
            <div className="flex flex-wrap gap-1">
              {[...selectedUnits].map(u => (
                <Badge key={u} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
                  {u}
                  <button type="button" onClick={() => toggleStr(setSelectedUnits, u)} className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Active location badges */}
          {locFilterActive && (
            <div className="flex flex-wrap gap-1">
              {[...selectedLocations].map(l => (
                <Badge key={l} variant="secondary" className="gap-1 text-xs pl-2 pr-1">
                  {l}
                  <button type="button" onClick={() => toggleStr(setSelectedLocations, l)} className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={checked => {
                      if (checked) setSelectedIds(new Set(data?.data?.map(p => p.id) ?? []));
                      else setSelectedIds(new Set());
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
                data?.data?.map(product => (
                  <TableRow
                    key={product.id}
                    className={cn("hover:bg-muted/50 transition-colors", selectedIds.has(product.id) && "bg-primary/5")}
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

      <AlertDialog open={!!deletingProduct} onOpenChange={open => !open && setDeletingProduct(null)}>
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
