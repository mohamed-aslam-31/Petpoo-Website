import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListBrands, useDeleteBrand, getListBrandsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Filter, ChevronsUpDown, Check, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { BrandFormDialog } from "./brand-form-dialog";
import { cn } from "@/lib/utils";

type SortKey = "az" | "za" | "new" | "old";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "A → Z" },
  { key: "za", label: "Z → A" },
  { key: "new", label: "Newest first" },
  { key: "old", label: "Oldest first" },
];

export function Brands() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; categories: { id: number; name: string }[] } | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteErrors, setBulkDeleteErrors] = useState<{ brandName: string; categories: { id: number; name: string }[] }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeSorts, setActiveSorts] = useState<Set<SortKey>>(new Set());
  const [minCat, setMinCat] = useState("");
  const [maxCat, setMaxCat] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZE_PRESETS = [10, 20, 50, 100];

  const queryClient = useQueryClient();
  const { data, isLoading } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });

  const deleteMutation = useDeleteBrand({
    mutation: {
      // onSuccess/onError handled per-call so single and bulk delete don't bleed into each other
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
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

  // ── Filter + sort pipeline (applied only to un-selected rows) ─────────────
  const processedData = useMemo(() => {
    if (!data) return [];
    let rows = [...data];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(b => b.name.toLowerCase().includes(q));
    }

    const minN = minCat !== "" ? Number(minCat) : null;
    const maxN = maxCat !== "" ? Number(maxCat) : null;
    if (minN !== null) rows = rows.filter(b => ((b as any).categoriesCount ?? 0) >= minN);
    if (maxN !== null) rows = rows.filter(b => ((b as any).categoriesCount ?? 0) <= maxN);

    rows.sort((a, b) => {
      // Name axis
      if (activeSorts.has("az") || activeSorts.has("za")) {
        const dir = activeSorts.has("az") ? 1 : -1;
        const cmp = a.name.localeCompare(b.name);
        if (cmp !== 0) return cmp * dir;
      }
      // Date axis
      if (activeSorts.has("new") || activeSorts.has("old")) {
        const dir = activeSorts.has("old") ? 1 : -1;
        const diff = new Date((a as any).createdAt).getTime() - new Date((b as any).createdAt).getTime();
        if (diff !== 0) return diff * dir;
      }
      return 0;
    });

    return rows;
  }, [data, search, minCat, maxCat, activeSorts]);

  // Reset to first page when filters/sort change
  const prevFilterKey = useRef("");
  const filterKey = `${search}|${minCat}|${maxCat}|${[...activeSorts].sort().join(",")}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (page !== 0) setPage(0);
  }

  // Selected brands always pinned to top on every page
  const selectedBrands = useMemo(
    () => (data ?? []).filter(b => selectedIds.has(b.id)),
    [data, selectedIds]
  );
  // Unselected rows go through the filter/sort pipeline; pagination applies only to these
  const unselectedBrands = useMemo(
    () => processedData.filter(b => !selectedIds.has(b.id)),
    [processedData, selectedIds]
  );

  const totalRows = unselectedBrands.length;
  const totalDisplay = processedData.length;

  // Dynamic page size options: presets ≤ total, always include 10
  const pageSizeOptions = useMemo(() => {
    const opts = PAGE_SIZE_PRESETS.filter(s => s <= totalDisplay);
    if (opts.length === 0) opts.push(10);
    return opts;
  }, [totalDisplay]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = unselectedBrands.slice(safePage * pageSize, safePage * pageSize + pageSize);
  // Selected rows always at top, then current page's unselected rows
  const displayRows = [...selectedBrands, ...pageRows];

  // Pagination display values (total includes selected + unselected)
  const showingFrom = totalRows === 0 && selectedBrands.length === 0 ? 0 : safePage * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize + pageSize, totalRows);

  // ── Checkbox helpers ───────────────────────────────────────────────────────
  const allChecked = displayRows.length > 0 && displayRows.every(b => selectedIds.has(b.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked || someChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayRows.map(b => b.id)));
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
  async function deleteSelectedBrands() {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let deleted = 0;
    const linkedErrors: { brandName: string; categories: { id: number; name: string }[] }[] = [];

    for (const id of ids) {
      const brand = selectedBrands.find(b => b.id === id);
      try {
        await new Promise<void>((resolve, reject) =>
          deleteMutation.mutate({ id }, { onSuccess: () => resolve(), onError: (e: any) => reject(e) })
        );
        deleted++;
      } catch (e: any) {
        const linked = e?.data?.linkedCategories as { id: number; name: string }[] | undefined;
        if (e?.status === 409 && linked?.length) {
          linkedErrors.push({ brandName: brand?.name ?? `Brand #${id}`, categories: linked });
        } else {
          toast.error(`Failed to delete "${brand?.name ?? `Brand #${id}`}"`);
        }
      }
    }

    setBulkDeleting(false);

    if (linkedErrors.length > 0) {
      setBulkDeleteErrors(linkedErrors);
      if (deleted > 0) toast.success(`${deleted} brand(s) deleted`);
    } else {
      setSelectedIds(new Set());
      setDeletingSelected(false);
      setBulkDeleteErrors([]);
      if (deleted > 0) toast.success(`${deleted} brand(s) deleted`);
    }
  }

  const catFilterActive = minCat !== "" || maxCat !== "";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Brands</h2>
          <p className="text-muted-foreground mt-1">Manage product brands and manufacturers.</p>
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
          <Button className="gap-2" onClick={() => { setEditingBrand(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Brand
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
              placeholder="Search brands..."
              className="pl-9 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Sort multi-select field */}
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

          {/* Categories count range filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Filter className="h-3 w-3" />
                Categories
                {catFilterActive && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5 h-4 text-[10px]">on</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3" align="start">
              <p className="text-xs font-semibold mb-3">Categories Count</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Min</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-7 text-xs"
                    value={minCat}
                    onChange={e => setMinCat(e.target.value)}
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
                    value={maxCat}
                    onChange={e => setMaxCat(e.target.value)}
                  />
                </div>
              </div>
              {catFilterActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs w-full"
                  onClick={() => { setMinCat(""); setMaxCat(""); }}
                >
                  Clear filter
                </Button>
              )}
            </PopoverContent>
          </Popover>
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
                <TableHead className="text-right">Categories</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No brands found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {displayRows.map((brand, idx) => {
                    const isSelected = selectedIds.has(brand.id);
                    const isLastSelected = isSelected && !displayRows[idx + 1]?.id
                      ? false
                      : isSelected && !selectedIds.has(displayRows[idx + 1]?.id ?? -1);
                    return (
                      <TableRow
                        key={brand.id}
                        className={cn(
                          "hover:bg-muted/50 transition-colors",
                          isSelected && "bg-primary/5",
                          isLastSelected && "border-b-2 border-primary/20"
                        )}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(brand.id)}
                            aria-label={`Select ${brand.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{brand.name}</TableCell>
                        <TableCell className="text-right">{(brand as any).categoriesCount ?? 0}</TableCell>
                        <TableCell className="text-right">
                          {/* Wide screens: inline icon buttons */}
                          <div className="hidden sm:flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingBrand(brand); setFormOpen(true); }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeletingBrand(brand)}
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
                                  onClick={() => { setEditingBrand(brand); setFormOpen(true); }}
                                >
                                  <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="cursor-pointer text-destructive focus:text-destructive"
                                  onClick={() => setDeletingBrand(brand)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
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
            <span className="shrink-0">Showing {showingFrom}–{showingTo} of {totalDisplay} brand{totalDisplay !== 1 ? "s" : ""}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next</Button>
            </div>
          </div>
        </div>
      </Card>

      <BrandFormDialog open={formOpen} onOpenChange={setFormOpen} brand={editingBrand} />

      {/* Single delete */}
      <AlertDialog open={!!deletingBrand} onOpenChange={open => { if (!open) { setDeletingBrand(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete brand?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="font-medium text-foreground/80 break-all mb-1">"{deletingBrand?.name}"</p>
                {!deleteError && <p>This will permanently remove this brand.</p>}
              </div>
            </AlertDialogDescription>
            {deleteError && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                <div className="flex items-start gap-2 text-destructive font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deleteError.categories.length} categor{deleteError.categories.length === 1 ? "y is" : "ies are"} linked to this brand.</span>
                </div>
                <p className="ml-6 text-muted-foreground">Go to the <strong>Categories</strong> page, clear the brand from those categories, then try deleting again.</p>
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
                  if (!deletingBrand) return;
                  deleteMutation.mutate(
                    { id: deletingBrand.id },
                    {
                      onSuccess: () => {
                        setDeletingBrand(null);
                        setDeleteError(null);
                        toast.success("Brand deleted");
                      },
                      onError: (e: any) => {
                        const linked = e?.data?.linkedCategories as { id: number; name: string }[] | undefined;
                        if (e?.status === 409 && linked?.length) {
                          setDeleteError({ message: e.data.error, categories: linked });
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
            <AlertDialogTitle>Delete {selectedIds.size} brand{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            {bulkDeleteErrors.length === 0 ? (
              <>
                <AlertDialogDescription>
                  The following brand{selectedIds.size > 1 ? "s" : ""} will be permanently removed:
                </AlertDialogDescription>
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-muted/40 divide-y text-sm">
                  {selectedBrands.map(b => (
                    <li key={b.id} className="flex items-start gap-2 px-3 py-2">
                      <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/70 mt-0.5" />
                      <span className="font-medium break-all">{b.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="mt-2 space-y-3">
                <AlertDialogDescription>
                  Some brands could not be deleted. Go to the <strong>Categories</strong> page, clear the brand from those categories, then try again.
                </AlertDialogDescription>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {bulkDeleteErrors.map(err => (
                    <div key={err.brandName} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-start gap-2 text-destructive font-medium min-w-0">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="break-all">"{err.brandName}" has {err.categories.length} linked categor{err.categories.length === 1 ? "y" : "ies"}.</span>
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
                onClick={deleteSelectedBrands}
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
