import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListBrands, useDeleteBrand, getListBrandsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Filter } from "lucide-react";
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
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeSorts, setActiveSorts] = useState<Set<SortKey>>(new Set());
  const [minCat, setMinCat] = useState("");
  const [maxCat, setMaxCat] = useState("");

  const queryClient = useQueryClient();
  const { data, isLoading } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });

  const deleteMutation = useDeleteBrand({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
        setDeletingBrand(null);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
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

  // Selected always pinned to top (not filtered); unselected go through pipeline
  const selectedBrands = useMemo(
    () => (data ?? []).filter(b => selectedIds.has(b.id)),
    [data, selectedIds]
  );
  const unselectedBrands = useMemo(
    () => processedData.filter(b => !selectedIds.has(b.id)),
    [processedData, selectedIds]
  );
  const displayRows = [...selectedBrands, ...unselectedBrands];

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
    const ids = [...selectedIds];
    let failed = 0;
    for (const id of ids) {
      try {
        await new Promise<void>((resolve, reject) =>
          deleteMutation.mutate({ id }, { onSuccess: () => resolve(), onError: () => reject() })
        );
      } catch {
        failed++;
      }
    }
    setSelectedIds(new Set());
    setDeletingSelected(false);
    queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
    if (failed > 0) toast.error(`${failed} brand(s) could not be deleted`);
    else toast.success(`${ids.length} brand(s) deleted`);
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

          {/* Sort pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Sort:</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={cn(
                  "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  activeSorts.has(key)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BrandFormDialog open={formOpen} onOpenChange={setFormOpen} brand={editingBrand} />

      {/* Single delete */}
      <AlertDialog open={!!deletingBrand} onOpenChange={open => !open && setDeletingBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingBrand?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this brand.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingBrand && deleteMutation.mutate({ id: deletingBrand.id }, { onSuccess: () => toast.success("Brand deleted") })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog open={deletingSelected} onOpenChange={open => !open && setDeletingSelected(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} brand{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected brand{selectedIds.size > 1 ? "s" : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteSelectedBrands}
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
