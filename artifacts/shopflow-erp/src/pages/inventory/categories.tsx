import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useListCategories, useDeleteCategory, getListCategoriesQueryKey,
  useListBrands, getListBrandsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Filter, ChevronsUpDown, Check, X, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { cn } from "@/lib/utils";

type SortKey = "az" | "za" | "new" | "old";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "A → Z" },
  { key: "za", label: "Z → A" },
  { key: "new", label: "Newest first" },
  { key: "old", label: "Oldest first" },
];

const PAGE_SIZE_PRESETS = [10, 20, 50, 100];

export function Categories() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; products: { id: number; name: string }[] } | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [bulkDeleteErrors, setBulkDeleteErrors] = useState<{ categoryName: string; products: { id: number; name: string }[] }[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeSorts, setActiveSorts] = useState<Set<SortKey>>(new Set());
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<number>>(new Set());
  const [filterNoBrand, setFilterNoBrand] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [minProducts, setMinProducts] = useState("");
  const [maxProducts, setMaxProducts] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const queryClient = useQueryClient();
  const { data, isLoading } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: brands } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });

  const deleteMutation = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      },
    },
  });

  // ── Sort toggling (mutually exclusive within name/date pairs) ──────────────
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

  // ── Brand multi-select filter helpers ─────────────────────────────────────
  function toggleBrand(id: number) {
    setSelectedBrandIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredBrandOptions = useMemo(() => {
    if (!brands) return [];
    const q = brandSearch.toLowerCase();
    return q ? brands.filter(b => b.name.toLowerCase().includes(q)) : brands;
  }, [brands, brandSearch]);

  // ── Filter + sort pipeline ─────────────────────────────────────────────────
  const processedData = useMemo(() => {
    if (!data) return [];
    let rows = [...data];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(c => c.name.toLowerCase().includes(q));
    }

    if (selectedBrandIds.size > 0 || filterNoBrand) {
      rows = rows.filter(c => {
        const brandId = (c as any).brandId;
        if (filterNoBrand && brandId == null) return true;
        return brandId != null && selectedBrandIds.has(brandId);
      });
    }

    const minN = minProducts !== "" ? Number(minProducts) : null;
    const maxN = maxProducts !== "" ? Number(maxProducts) : null;
    if (minN !== null) rows = rows.filter(c => (c.productsCount ?? 0) >= minN);
    if (maxN !== null) rows = rows.filter(c => (c.productsCount ?? 0) <= maxN);

    rows.sort((a, b) => {
      if (activeSorts.has("az") || activeSorts.has("za")) {
        const dir = activeSorts.has("az") ? 1 : -1;
        const cmp = a.name.localeCompare(b.name);
        if (cmp !== 0) return cmp * dir;
      }
      if (activeSorts.has("new") || activeSorts.has("old")) {
        const dir = activeSorts.has("old") ? 1 : -1;
        const diff = new Date((a as any).createdAt).getTime() - new Date((b as any).createdAt).getTime();
        if (diff !== 0) return diff * dir;
      }
      return 0;
    });

    return rows;
  }, [data, search, selectedBrandIds, minProducts, maxProducts, activeSorts]);

  // Reset to first page when filters/sort change
  const prevFilterKey = useRef("");
  const filterKey = `${search}|${minProducts}|${maxProducts}|${filterNoBrand}|${[...selectedBrandIds].sort().join(",")}|${[...activeSorts].sort().join(",")}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (page !== 0) setPage(0);
  }

  // Selected categories always pinned to top on every page
  const selectedCategories = useMemo(
    () => (data ?? []).filter(c => selectedIds.has(c.id)),
    [data, selectedIds]
  );
  // Unselected rows go through the filter/sort pipeline; pagination applies only to these
  const unselectedCategories = useMemo(
    () => processedData.filter(c => !selectedIds.has(c.id)),
    [processedData, selectedIds]
  );

  const totalRows = unselectedCategories.length;
  const totalDisplay = processedData.length;

  // Dynamic page size options: presets ≤ total, always include 10
  const pageSizeOptions = useMemo(() => {
    const opts = PAGE_SIZE_PRESETS.filter(s => s <= totalDisplay);
    if (opts.length === 0) opts.push(10);
    return opts;
  }, [totalDisplay]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = unselectedCategories.slice(safePage * pageSize, safePage * pageSize + pageSize);
  // Selected rows always at top, then current page's unselected rows
  const displayRows = [...selectedCategories, ...pageRows];
  // Pagination display values (total includes selected + unselected)
  const showingFrom = totalRows === 0 && selectedCategories.length === 0 ? 0 : safePage * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize + pageSize, totalRows);

  // ── Checkbox helpers ───────────────────────────────────────────────────────
  const allChecked = displayRows.length > 0 && displayRows.every(c => selectedIds.has(c.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked || someChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayRows.map(c => c.id)));
    }
  }

  function toggleRow(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────
  async function deleteSelectedCategories() {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let deleted = 0;
    const linkedErrors: { categoryName: string; products: { id: number; name: string }[] }[] = [];

    for (const id of ids) {
      const category = selectedCategories.find(c => c.id === id);
      try {
        await new Promise<void>((resolve, reject) =>
          deleteMutation.mutate({ id }, { onSuccess: () => resolve(), onError: (e: any) => reject(e) })
        );
        deleted++;
      } catch (e: any) {
        const linked = e?.data?.linkedProducts as { id: number; name: string }[] | undefined;
        if (e?.status === 409 && linked?.length) {
          linkedErrors.push({ categoryName: category?.name ?? `Category #${id}`, products: linked });
        } else {
          toast.error(`Failed to delete "${category?.name ?? `Category #${id}`}"`);
        }
      }
    }

    setBulkDeleting(false);

    if (linkedErrors.length > 0) {
      setBulkDeleteErrors(linkedErrors);
      if (deleted > 0) toast.success(`${deleted} category(ies) deleted`);
    } else {
      setSelectedIds(new Set());
      setDeletingSelected(false);
      setBulkDeleteErrors([]);
      if (deleted > 0) toast.success(`${deleted} category(ies) deleted`);
    }
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  }

  const brandFilterActive = selectedBrandIds.size > 0 || filterNoBrand;
  const productFilterActive = minProducts !== "" || maxProducts !== "";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground mt-1">Manage product categories and groupings.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setDeletingSelected(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button className="gap-2" onClick={() => { setEditingCategory(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Category
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
              placeholder="Search categories..."
              className="pl-9 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Sort multi-select */}
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
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(key)}
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
                    onClick={() => setActiveSorts(new Set())}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
                  >
                    Clear sort
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>

          {/* Brand multi-select filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Brand
                {brandFilterActive && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">{selectedBrandIds.size + (filterNoBrand ? 1 : 0)}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search brands..."
                    className="pl-7 h-7 text-xs"
                    value={brandSearch}
                    onChange={e => setBrandSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                <button
                  type="button"
                  onClick={() => setFilterNoBrand(v => !v)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", filterNoBrand ? "opacity-100 text-primary" : "opacity-0")} />
                  <span className="truncate text-muted-foreground">No Brand</span>
                </button>
                {filteredBrandOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No brands found</p>
                ) : filteredBrandOptions.map(brand => (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => toggleBrand(brand.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0", selectedBrandIds.has(brand.id) ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="truncate">{brand.name}</span>
                  </button>
                ))}
              </div>
              {brandFilterActive && (
                <div className="border-t p-1">
                  <button
                    type="button"
                    onClick={() => { setSelectedBrandIds(new Set()); setFilterNoBrand(false); setBrandSearch(""); }}
                    className="flex w-full items-center px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
                  >
                    Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Products count range filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Products
                {productFilterActive && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">on</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3" align="start">
              <p className="text-xs font-semibold mb-3">Products Count</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Min</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-7 text-xs"
                    value={minProducts}
                    onChange={e => setMinProducts(e.target.value)}
                  />
                </div>
                <span className="text-muted-foreground text-xs mt-4">–</span>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Max</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="∞"
                    className="h-7 text-xs"
                    value={maxProducts}
                    onChange={e => setMaxProducts(e.target.value)}
                  />
                </div>
              </div>
              {productFilterActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs w-full"
                  onClick={() => { setMinProducts(""); setMaxProducts(""); }}
                >
                  Clear filter
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {/* Clear all filters */}
          {(search !== "" || activeSorts.size > 0 || brandFilterActive || productFilterActive) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("");
                setActiveSorts(new Set());
                setSelectedBrandIds(new Set());
                setFilterNoBrand(false);
                setBrandSearch("");
                setMinProducts(""); setMaxProducts("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear all filters
            </Button>
          )}
        </div>

        {/* Table */}
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No categories found.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((category, idx) => {
                  const isSelected = selectedIds.has(category.id);
                  const isLastSelected = isSelected && !selectedIds.has(displayRows[idx + 1]?.id ?? -1);
                  return (
                    <TableRow
                      key={category.id}
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        isSelected && "bg-primary/5",
                        isLastSelected && "border-b-2 border-primary/20"
                      )}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(category.id)}
                          aria-label={`Select ${category.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {(category as any).brandName ?? "No Brand"}
                      </TableCell>
                      <TableCell className="text-right">{category.productsCount || 0}</TableCell>
                      <TableCell className="text-right">
                        {/* Wide screens: inline icon buttons */}
                        <div className="hidden sm:flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => { setEditingCategory(category); setFormOpen(true); }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingCategory(category)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {/* Narrow screens: three-dot dropdown */}
                        <div className="sm:hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => { setEditingCategory(category); setFormOpen(true); }}
                              >
                                <Edit className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setDeletingCategory(category)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-t text-sm text-muted-foreground">
          {/* Rows per page */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="shrink-0">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}
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
          {/* Count + navigation */}
          <div className="flex items-center gap-3">
            <span className="shrink-0">Showing {showingFrom}–{showingTo} of {totalDisplay} categor{totalDisplay !== 1 ? "ies" : "y"}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</Button>
            </div>
          </div>
        </div>
      </Card>

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editingCategory} />

      {/* Single delete */}
      <AlertDialog open={!!deletingCategory} onOpenChange={open => { if (!open) { setDeletingCategory(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="font-medium text-foreground/80 break-all mb-1">"{deletingCategory?.name}"</p>
                {!deleteError && <p>This will permanently remove this category.</p>}
              </div>
            </AlertDialogDescription>
            {deleteError && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                <div className="flex items-start gap-2 text-destructive font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deleteError.products.length} product{deleteError.products.length === 1 ? " is" : "s are"} linked to this category.</span>
                </div>
                <p className="ml-6 text-muted-foreground">Remove the category from those products first, then try deleting again.</p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{deleteError ? "Close" : "Cancel"}</AlertDialogCancel>
            {!deleteError && (
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!deletingCategory) return;
                  deleteMutation.mutate(
                    { id: deletingCategory.id },
                    {
                      onSuccess: () => {
                        const id = deletingCategory.id;
                        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
                        setDeletingCategory(null);
                        setDeleteError(null);
                        toast.success("Category deleted");
                      },
                      onError: (e: any) => {
                        const linked = e?.data?.linkedProducts as { id: number; name: string }[] | undefined;
                        if (e?.status === 409 && linked?.length) {
                          setDeleteError({ message: e.data.error, products: linked });
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
      <AlertDialog open={deletingSelected} onOpenChange={open => { if (!open) { setDeletingSelected(false); setBulkDeleteErrors([]); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} categor{selectedIds.size > 1 ? "ies" : "y"}?</AlertDialogTitle>
            {bulkDeleteErrors.length === 0 ? (
              <>
                <AlertDialogDescription>
                  The following {selectedIds.size > 1 ? "categories" : "category"} will be permanently removed:
                </AlertDialogDescription>
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-muted/40 divide-y text-sm">
                  {selectedCategories.map(c => (
                    <li key={c.id} className="flex items-start gap-2 px-3 py-2">
                      <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/70 mt-0.5" />
                      <span className="font-medium break-all">{c.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="mt-2 space-y-3">
                <AlertDialogDescription>
                  Some categories could not be deleted because they are linked to products. Remove the category from those products first, then try again.
                </AlertDialogDescription>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {bulkDeleteErrors.map(err => (
                    <div key={err.categoryName} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-start gap-2 text-destructive font-medium min-w-0">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="break-all">"{err.categoryName}" is linked to {err.products.length} product{err.products.length === 1 ? "" : "s"}.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{bulkDeleteErrors.length > 0 ? "Close" : "Cancel"}</AlertDialogCancel>
            {bulkDeleteErrors.length === 0 && (
              <Button
                variant="destructive"
                disabled={bulkDeleting}
                onClick={deleteSelectedCategories}
              >
                {bulkDeleting ? "Deleting..." : "Delete All"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
