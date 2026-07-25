import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  useCreatePurchase,
  useListSuppliers,
  useCreateSupplier,
  useListProducts,
  useListBrands,
  useListCategories,
  getListPurchasesQueryKey,
  getListSuppliersQueryKey,
  getListBrandsQueryKey,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigationGuard, useBeforeUnload } from "@/components/navigation-guard";
import { readDrafts, upsertDraft, removeDraft, type PurchaseDraft } from "@/lib/purchase-drafts";
import { getMargins } from "@/lib/price-margins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Trash2, Plus, ArrowLeft, Printer, Save, Check, ChevronsUpDown, FileText, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────────
// Searchable select for table cells
// ────────────────────────────────────────────────────────────────────────────────

const NO_BRAND = "no-brand";
const NO_CATEGORY = "no-category";
/** Prefix for brand/category values that are pending creation (deferred until Save Purchase) */
const NEW_ITEM_PREFIX = "__new__:";

// ── Units (stored in localStorage, same list as product-form-dialog) ──────────
const UNITS_STORAGE_KEY = "shopflow-units";
const DEFAULT_UNITS = [
  "pc", "pcs", "kg", "g", "mg", "l", "ml",
  "box", "dozen", "pair", "set", "roll", "sheet", "bag", "bottle",
];
function getStoredUnits(): string[] {
  try {
    const stored = localStorage.getItem(UNITS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_UNITS;
}

// ── Searchable select for table cells ─────────────────────────────────────────
// Supports deferred "Add new" for brand/category (stores __new__:name in form,
// actual API creation is deferred until Save Purchase).
// Supports staticAddLabel for products (opens a dialog immediately).

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  buttonClassName,
  popoverWidth = "w-48",
  allowCreate = false,
  staticAddLabel,
  onStaticAdd,
  maxLength,
  allowedCharsPattern,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  buttonClassName?: string;
  popoverWidth?: string;
  /** When true, typing an unknown name shows "Add 'X'" — stores __new__:X (deferred creation) */
  allowCreate?: boolean;
  /** Always-visible "Add new …" button (opens a dialog, e.g. for products) */
  staticAddLabel?: string;
  onStaticAdd?: () => void;
  /** Max characters allowed when typing a new entry (e.g. 70 for brand/category, 80 for product) */
  maxLength?: number;
  /** Regex that each character must match; invalid chars are silently dropped */
  allowedCharsPattern?: RegExp;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [charError, setCharError] = useState<string | null>(null);

  const isPendingNew = value.startsWith(NEW_ITEM_PREFIX);
  const pendingNewName = isPendingNew ? value.slice(NEW_ITEM_PREFIX.length) : null;

  // Include any pending-new item in the options list so it shows as "selected"
  const allOptions: { value: string; label: string }[] = isPendingNew
    ? [{ value, label: pendingNewName! }, ...options]
    : options;

  const selected = allOptions.find((o) => o.value === value);

  const trimmed = search.trim();
  const notExists =
    trimmed.length >= 1 &&
    !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase()) &&
    !(`${NEW_ITEM_PREFIX}${trimmed}` === value); // already selected as pending-new

  // Validate the typed search when in create mode
  const searchHasInvalidChars = allowedCharsPattern && search.length > 0
    ? !allowedCharsPattern.test(search)
    : false;
  const searchExceedsMax = maxLength !== undefined && trimmed.length > maxLength;
  const canCreate = allowCreate && notExists && !searchHasInvalidChars && !searchExceedsMax;

  function handleSearchChange(val: string) {
    // Strip disallowed characters if a pattern is provided
    let filtered = val;
    if (allowedCharsPattern) {
      filtered = val.split("").filter((ch) => allowedCharsPattern.test(ch)).join("");
      if (filtered !== val) {
        setCharError("Only letters, numbers, spaces, and - / & ( ) . ' + are allowed");
      } else {
        setCharError(null);
      }
    } else {
      setCharError(null);
    }
    // Cap at maxLength
    if (maxLength !== undefined && filtered.length > maxLength) {
      filtered = filtered.slice(0, maxLength);
    }
    setSearch(filtered);
  }

  function handleSelect(val: string) {
    onValueChange(val);
    setOpen(false);
    setSearch("");
    setCharError(null);
  }

  const showCounter = allowCreate && maxLength !== undefined && search.length > 0;
  const atLimit = maxLength !== undefined && search.length >= maxLength;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setCharError(null); } }}>
      <div className="flex items-center gap-1">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn("h-8 min-w-0 flex-1 justify-between px-2 text-xs font-normal overflow-hidden", buttonClassName)}
          >
            <span className={cn("truncate min-w-0 flex-1 text-left", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            {isPendingNew && (
              <span className="ml-1 shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                New
              </span>
            )}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Clear ${placeholder.replace("Select ", "").replace("Search ", "")}`}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onValueChange("")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <PopoverContent className={cn("p-0", popoverWidth)} align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
            value={search}
            onValueChange={handleSearchChange}
          />
          {/* Char counter + error shown when typing a new entry */}
          {allowCreate && search.length > 0 && (
            <div className="px-2 pb-1 flex flex-col gap-0.5">
              {showCounter && (
                <div className="flex justify-end">
                  <span className={cn("text-[10px]", atLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
                    {search.length}/{maxLength}
                  </span>
                </div>
              )}
              {charError && (
                <p className="text-[10px] text-destructive leading-tight">{charError}</p>
              )}
            </div>
          )}
          <CommandList className="max-h-48 overflow-y-auto">
            {/* Static "Add new" button for products (opens dialog immediately) */}
            {staticAddLabel && onStaticAdd && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__static_add__"
                    onSelect={() => { setOpen(false); setSearch(""); setCharError(null); onStaticAdd(); }}
                    className="text-xs text-primary font-medium"
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    {staticAddLabel}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {/* Deferred "Add 'X'" for brand / category — stores __new__:X */}
            {canCreate && (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`${NEW_ITEM_PREFIX}${trimmed}`}
                    onSelect={() => {
                      setOpen(false);
                      setSearch("");
                      setCharError(null);
                      onValueChange(`${NEW_ITEM_PREFIX}${trimmed}`);
                    }}
                    className="text-xs text-primary font-medium"
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    Add "{trimmed}" <span className="ml-1 text-[9px] text-muted-foreground">(saved on submit)</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {allOptions.filter((o) =>
              !search || o.label.toLowerCase().includes(search.toLowerCase())
            ).length === 0 && !canCreate ? (
              <div className="py-2 text-xs text-center text-muted-foreground">No results.</div>
            ) : (
              <CommandGroup>
                {allOptions
                  .filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()))
                  .map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => handleSelect(opt.value)}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3 w-3", value === opt.value ? "opacity-100" : "opacity-0")} />
                      {opt.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Unit select (searchable, can add new) ─────────────────────────────────────

function UnitSelect({
  value,
  onChange,
  error,
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (unit: string) => void;
  error?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [availableUnits, setAvailableUnits] = useState<string[]>(getStoredUnits);

  const filtered = availableUnits.filter(u =>
    u.toLowerCase().includes(search.toLowerCase())
  );
  const trimmed = search.trim();
  const hasWhitespace = /\s/.test(trimmed);
  const tooLong = trimmed.length > 10;
  const notExists = !availableUnits.some(u => u.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length >= 1 && !hasWhitespace && !tooLong && notExists;
  const atLimit = search.length >= 10;

  function handleSearchChange(val: string) {
    // Strip spaces and hard-cap at 10 characters
    const noSpaces = val.replace(/\s/g, "");
    setSearch(noSpaces.slice(0, 10));
  }

  function select(unit: string) {
    onChange(unit);
    setOpen(false);
    setSearch("");
  }

  function addUnit() {
    if (!trimmed || hasWhitespace || tooLong) return;
    const updated = [...availableUnits, trimmed];
    setAvailableUnits(updated);
    try { localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
    select(trimmed);
  }

  return (
    <div>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <div className="flex items-center gap-1">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              "min-w-0 flex-1 justify-between font-normal text-left overflow-hidden",
              compact ? "h-8 px-2 text-xs" : "h-9 text-sm",
              error && "border-destructive",
              disabled && "opacity-60 cursor-not-allowed"
            )}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || "Select unit…"}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Clear unit"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
        <PopoverContent className="p-0 w-44" align="start" sideOffset={4}>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or add…"
              value={search}
              onValueChange={handleSearchChange}
              className="h-8 text-xs"
            />
            {search.length > 0 && (
              <div className="flex items-center justify-end px-2 pb-1">
                <span className={cn("text-[10px]", atLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {search.length}/10
                </span>
              </div>
            )}
            <CommandList className="max-h-44 overflow-y-auto">
              {canAdd && (
                <>
                  <CommandGroup>
                    <CommandItem value={`__add__${trimmed}`} onSelect={addUnit} className="text-xs text-primary font-medium">
                      <Plus className="mr-2 h-3 w-3" />
                      Add "{trimmed}"
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {filtered.length > 0 ? (
                <CommandGroup>
                  {filtered.map(unit => (
                    <CommandItem key={unit} value={unit} onSelect={() => select(unit)} className="text-xs">
                      <Check className={cn("mr-2 h-3 w-3", value === unit ? "opacity-100" : "opacity-0")} />
                      {unit}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : trimmed.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">No units.</div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

// NewProductDialog removed — new products are now created inline via the
// same deferred __new__: pattern as brands and categories.

// ────────────────────────────────────────────────────────────────────────────────
// Form schema
// ────────────────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  /** Tracks the selected product: "" = none, "123" = existing id, "__new__:Name" = pending creation */
  productComboVal: z.string().min(1, "Product required"),
  productId: z.coerce.number().optional(),
  brandComboVal: z.string().min(1, "Brand required"),
  brandId: z.coerce.number().nullable().optional(),
  brandName: z.string().nullable().optional(),
  categoryComboVal: z.string().min(1, "Category required"),
  categoryId: z.coerce.number().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  currentStock: z.coerce.number().optional(),
  quantity: z.coerce.number().int().min(1, "Qty must be ≥ 1"),
  unit: z.string().min(1, "Unit required"),
  purchasePrice: z.coerce.number().min(0, "Price required"),
  discountPercent: z.coerce.number().min(0).max(100, "Discount cannot exceed 100%").optional(),
  gstPercent: z.coerce.number().min(0).optional(),
  lineTotal: z.coerce.number().optional(),
  /** Stored purchase price at the time the product was selected (for comparison UI) */
  prevPurchasePrice: z.coerce.number().nullable().optional(),
  /** When true, update the product's stored purchase price on save */
  updatePrice: z.boolean().optional(),
});

const schema = z.object({
  supplierId: z.coerce.number().min(1, "Supplier required"),
  purchaseDate: z.string().min(1, "Date required"),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
  packingCharges: z.coerce.number().min(0).optional(),
  transportCharges: z.coerce.number().min(0).optional(),
  loadingCharges: z.coerce.number().min(0).optional(),
  otherCharges: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof schema>;

const emptyItem = (): z.infer<typeof itemSchema> => ({
  productComboVal: "",
  productId: 0,
  brandComboVal: "",
  brandId: null,
  brandName: null,
  categoryComboVal: "",
  categoryId: null,
  categoryName: null,
  currentStock: 0,
  quantity: 1,
  unit: "",
  purchasePrice: 0,
  discountPercent: 0,
  gstPercent: 0,
  lineTotal: 0,
  prevPurchasePrice: null,
  updatePrice: false,
});


// ────────────────────────────────────────────────────────────────────────────────
// Add Supplier mini-modal
// ────────────────────────────────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  notes: z.string().optional(),
});
type SupplierFormValues = z.infer<typeof supplierSchema>;

function AddSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", phone: "", email: "", address: "", gstNumber: "", notes: "" },
  });

  useEffect(() => {
    if (open) form.reset({ name: "", phone: "", email: "", address: "", gstNumber: "", notes: "" });
  }, [open, form]);

  const createMutation = useCreateSupplier({
    mutation: {
      onSuccess: (s) => {
        toast.success("Supplier added");
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        onCreated(s.id);
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to add supplier"),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Supplier</DialogTitle>
          <DialogDescription>Add a new supplier to your records.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate({ data: v }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Supplier Name *</FormLabel><FormControl><Input placeholder="Company or supplier name" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone *</FormLabel><FormControl><Input placeholder="Phone number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="gstNumber" render={({ field }) => (
                <FormItem><FormLabel>GST Number</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Address</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving…" : "Add Supplier"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Currency formatter
// ────────────────────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ────────────────────────────────────────────────────────────────────────────────
// Main form
// ────────────────────────────────────────────────────────────────────────────────

export function PurchaseForm() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { registerNavigationGuard, navigateWithoutGuard } = useNavigationGuard();
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [pendingNavigate, setPendingNavigate] = useState<(() => void) | null>(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  // ID of the draft currently being edited (null = new, unsaved draft)
  const [draftId, setDraftId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("draft")
  );

  // Data sources
  const { data: suppliersData } = useListSuppliers({ limit: 500 });
  const { data: productsData } = useListProducts({ limit: 500 });
  const { data: brandsData } = useListBrands();
  const { data: categoriesData } = useListCategories();

  const suppliers = suppliersData?.data ?? [];
  const allProducts = productsData?.data ?? [];
  const allBrands = brandsData ?? [];
  const allCategories = categoriesData ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierId: 0,
      purchaseDate: new Date().toISOString().slice(0, 10),
      notes: "",
      items: [emptyItem()],
      packingCharges: 0,
      transportCharges: 0,
      loadingCharges: 0,
      otherCharges: 0,
      discount: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items");

  useEffect(() => {
    // Skip draft restore when opened as a fresh form (?new=1)
    if (window.location.search.includes("new=1")) return;

    const id = new URLSearchParams(window.location.search).get("draft");
    if (!id) return;

    const found = readDrafts().find((d) => d.id === id);
    if (!found) return;

    try {
      form.reset(found.values as unknown as FormValues);
      setWithGST(found.withGST !== false);
      toast.info("Draft restored");
    } catch {
      removeDraft(id);
    }
  }, [form]);

  // ── Checkbox selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = fields.length > 0 && fields.every((f) => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(fields.map((f) => f.id)));
    }
  };

  const deleteSelected = () => {
    const indices = fields
      .map((f, i) => (selectedIds.has(f.id) ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => b - a);
    // Always keep at least one row — if all are selected, skip the first (index 0)
    const allWillBeDeleted = indices.length === fields.length;
    const toRemove = allWillBeDeleted ? indices.filter((i) => i !== 0) : indices;
    toRemove.forEach((i) => remove(i));
    setSelectedIds(new Set());
  };
  const watchedCharges = form.watch(["packingCharges", "transportCharges", "loadingCharges", "otherCharges", "discount"]);

  const [withGST, setWithGST] = useState(true);
  const isDirty = form.formState.isDirty || withGST !== true;
  useBeforeUnload(isDirty);

  const finishNavigation = useCallback((path: string, navigate: () => void) => {
    setConfirmExitOpen(false);
    setPendingNavigation(null);
    setPendingNavigate(null);
    navigate();
  }, []);

  const requestExit = useCallback((path: string, navigate: () => void) => {
    if (isDirty) {
      setPendingNavigation(path);
      setPendingNavigate(() => navigate);
      setConfirmExitOpen(true);
      return;
    }
    navigate();
  }, [isDirty]);

  useEffect(() => {
    return registerNavigationGuard(requestExit, location);
  }, [location, registerNavigationGuard, requestExit]);

  const buildDraftEntry = (): PurchaseDraft => {
    const values = form.getValues();
    const supplierName = suppliers.find((s) => s.id === Number(values.supplierId))?.name ?? "—";
    const id = draftId ?? Date.now().toString();
    return {
      id,
      supplierName,
      purchaseDate: values.purchaseDate ?? "",
      itemCount: values.items?.length ?? 0,
      savedAt: new Date().toISOString(),
      values: { ...values, supplierName } as Record<string, unknown>,
      withGST,
    };
  };

  const saveDraftAndLeave = () => {
    const entry = buildDraftEntry();
    upsertDraft(entry);
    if (!draftId) setDraftId(entry.id);
    toast.success("Purchase moved to drafts");
    if (pendingNavigation && pendingNavigate) finishNavigation(pendingNavigation, pendingNavigate);
  };

  const discardAndLeave = () => {
    if (draftId) removeDraft(draftId);
    if (pendingNavigation && pendingNavigate) finishNavigation(pendingNavigation, pendingNavigate);
  };

  const saveDraft = () => {
    const entry = buildDraftEntry();
    upsertDraft(entry);
    if (!draftId) setDraftId(entry.id);
    toast.success("Purchase saved as draft");
    navigateWithoutGuard(() => setLocation("/inventory/purchases"));
  };

  // ── Totals ────────────────────────────────────────────────────────────────────

  const subtotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    return acc + qty * price;
  }, 0);

  const itemDiscountTotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    return acc + (qty * price * discountPercent) / 100;
  }, 0);

  const gstTotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    const gst = Number(item.gstPercent) || 0;
    const base = qty * price * (1 - discountPercent / 100);
    return acc + base * (gst / 100);
  }, 0);

  const packingCharges = Number(watchedCharges[0]) || 0;
  const transportCharges = Number(watchedCharges[1]) || 0;
  const loadingCharges = Number(watchedCharges[2]) || 0;
  const otherCharges = Number(watchedCharges[3]) || 0;
  const discount = Number(watchedCharges[4]) || 0;
  const additionalCharges = packingCharges + transportCharges + loadingCharges + otherCharges;
  const afterDiscount = subtotal - itemDiscountTotal - discount;
  const afterGST = afterDiscount + (withGST ? gstTotal : 0);
  const grandTotal = afterGST + additionalCharges;

  // ── Mutation ──────────────────────────────────────────────────────────────────

  // Flush any "update price" requests for items where checkbox is ticked.
  // Also recalculates wholesale and retail prices using the global profit margins
  // (same formula as the product form's purchase-price onChange handler).
  async function flushPriceUpdates() {
    const items = form.getValues("items");
    const toUpdate = items.filter((i) => i.updatePrice && Number(i.productId) > 0);
    if (toUpdate.length === 0) return;
    const { wholesale: wPct, retail: rPct } = getMargins();
    await Promise.allSettled(
      toUpdate.map((i) => {
        const purchasePrice = Number(i.purchasePrice);
        const wholesalePrice = Math.round(purchasePrice * (1 + wPct / 100) * 100) / 100;
        const retailPrice    = Math.round(purchasePrice * (1 + rPct / 100) * 100) / 100;
        return fetch(`/api/products/${i.productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchasePrice,
            wholesalePrice,
            retailPrice,
            sellingPrice: retailPrice,
          }),
        });
      })
    );
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }

  const createMutation = useCreatePurchase({
    mutation: {
      onSuccess: async () => {
        await flushPriceUpdates();
        toast.success("Purchase saved — stock updated");
        if (draftId) removeDraft(draftId);
        queryClient.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
        navigateWithoutGuard(() => setLocation("/inventory/purchases"));
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to save purchase"),
    },
  });

  const createAndPrintMutation = useCreatePurchase({
    mutation: {
      onSuccess: async (data) => {
        await flushPriceUpdates();
        toast.success("Purchase saved — stock updated");
        if (draftId) removeDraft(draftId);
        queryClient.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
        navigateWithoutGuard(() => setLocation(`/inventory/purchases/${data.id}`));
        setTimeout(() => window.print(), 600);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to save purchase"),
    },
  });

  function buildPayload(values: FormValues) {
    return {
      ...values,
      packingCharges: values.packingCharges ?? 0,
      transportCharges: values.transportCharges ?? 0,
      loadingCharges: values.loadingCharges ?? 0,
      otherCharges: values.otherCharges ?? 0,
      discount: values.discount ?? 0,
    } as any;
  }

  async function onSave(values: FormValues) {
    setIsResolving(true);
    try {
      const resolved = await resolveNewItemsAndGetPayload(values);
      if (!resolved) return;
      createMutation.mutate({ data: buildPayload(resolved) });
    } finally {
      setIsResolving(false);
    }
  }

  async function onSaveAndPrint(values: FormValues) {
    setIsResolving(true);
    try {
      const resolved = await resolveNewItemsAndGetPayload(values);
      if (!resolved) return;
      createAndPrintMutation.mutate({ data: buildPayload(resolved) });
    } finally {
      setIsResolving(false);
    }
  }

  function scrollAndFocus(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    );
    focusable?.focus();
  }

  function onInvalid(errors: Record<string, any>) {
    setHasAttemptedSave(true);
    if (errors.supplierId) { scrollAndFocus("field-supplierId"); return; }
    if (errors.purchaseDate) { form.setFocus("purchaseDate"); return; }
    if (errors.items) {
      const itemErrors: any[] = errors.items;
      for (let i = 0; i < itemErrors.length; i++) {
        const row = itemErrors[i];
        if (!row) continue;
        if (row.brandComboVal || row.categoryComboVal || row.productComboVal) {
          scrollAndFocus(`item-row-${i}`); return;
        }
        if (row.quantity) { form.setFocus(`items.${i}.quantity`); return; }
        if (row.purchasePrice) { form.setFocus(`items.${i}.purchasePrice`); return; }
      }
    }
  }

  // ── Per-row cascading logic ───────────────────────────────────────────────────

  const handleProductChange = useCallback(
    (index: number, comboVal: string) => {
      if (!comboVal) {
        // Clearing Product is intentionally independent: keep any Brand and
        // Category values the user selected or that Product previously filled.
        form.setValue(`items.${index}.productComboVal`, "", { shouldDirty: true });
        form.setValue(`items.${index}.productId`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.currentStock`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.unit`, "", { shouldDirty: true });
        form.setValue(`items.${index}.purchasePrice`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.gstPercent`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.prevPurchasePrice`, null, { shouldDirty: true });
        form.setValue(`items.${index}.updatePrice`, false, { shouldDirty: true });
        return;
      }
      if (comboVal.startsWith(NEW_ITEM_PREFIX)) {
        // ── Pending-new product: store name, clear auto-fills so user enters them ──
        form.setValue(`items.${index}.productComboVal`, comboVal, { shouldDirty: true });
        form.setValue(`items.${index}.productId`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.currentStock`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.unit`, "", { shouldDirty: true });
        form.setValue(`items.${index}.purchasePrice`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.gstPercent`, 0, { shouldDirty: true });
        form.setValue(`items.${index}.prevPurchasePrice`, null, { shouldDirty: true });
        form.setValue(`items.${index}.updatePrice`, false, { shouldDirty: true });
        return;
      }

      // ── Existing product ──────────────────────────────────────────────────────
      const pid = Number(comboVal);
      const product = allProducts.find((p: { id: number }) => p.id === pid);
      if (!product) return;

      const brand = allBrands.find((b: { id: number }) => b.id === product.brandId);
      const category = allCategories.find((c: { id: number }) => c.id === product.categoryId);

      const prevPrice = parseFloat(String(product.purchasePrice ?? 0));
      form.setValue(`items.${index}.productComboVal`, comboVal, { shouldDirty: true });
      form.setValue(`items.${index}.productId`, pid, { shouldDirty: true });
      form.setValue(`items.${index}.currentStock`, product.currentStock ?? 0, { shouldDirty: true });
      form.setValue(`items.${index}.unit`, product.unit ?? "", { shouldDirty: true });
      form.setValue(`items.${index}.purchasePrice`, prevPrice, { shouldDirty: true });
      form.setValue(`items.${index}.gstPercent`, parseFloat(String(product.gstPercent ?? 0)), { shouldDirty: true });
      form.setValue(`items.${index}.prevPurchasePrice`, prevPrice, { shouldDirty: true });
      form.setValue(`items.${index}.updatePrice`, false, { shouldDirty: true });
      // Auto-fill brand
      const brandCombo = product.brandId ? String(product.brandId) : NO_BRAND;
      form.setValue(`items.${index}.brandComboVal`, brandCombo, { shouldDirty: true });
      form.setValue(`items.${index}.brandId`, product.brandId ?? null, { shouldDirty: true });
      form.setValue(`items.${index}.brandName`, brand?.name ?? null, { shouldDirty: true });
      // Auto-fill category — use name as comboVal (deduplication key)
      const catCombo = category?.name ?? NO_CATEGORY;
      form.setValue(`items.${index}.categoryComboVal`, catCombo, { shouldDirty: true });
      form.setValue(`items.${index}.categoryId`, product.categoryId ?? null, { shouldDirty: true });
      form.setValue(`items.${index}.categoryName`, category?.name ?? null, { shouldDirty: true });
    },
    [allProducts, allBrands, allCategories, form]
  );

  const handleBrandChange = useCallback(
    (index: number, comboVal: string) => {
      if (!comboVal) {
        form.setValue(`items.${index}.brandComboVal`, "", { shouldDirty: true });
        form.setValue(`items.${index}.brandId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.brandName`, null, { shouldDirty: true });
        return;
      }
      if (comboVal.startsWith(NEW_ITEM_PREFIX)) {
        // Pending-new brand: store the name, leave brandId null (resolved on save)
        const name = comboVal.slice(NEW_ITEM_PREFIX.length);
        form.setValue(`items.${index}.brandComboVal`, comboVal, { shouldDirty: true });
        form.setValue(`items.${index}.brandId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.brandName`, name, { shouldDirty: true });
      } else {
        const bid = comboVal === NO_BRAND ? null : Number(comboVal) || null;
        const brand = allBrands.find((b: { id: number }) => b.id === bid);
        form.setValue(`items.${index}.brandComboVal`, comboVal, { shouldDirty: true });
        form.setValue(`items.${index}.brandId`, bid, { shouldDirty: true });
        form.setValue(`items.${index}.brandName`, brand?.name ?? null, { shouldDirty: true });
      }
      // Brand changes are independent and never clear or auto-select Product.
    },
    [allBrands, form]
  );

  const handleCategoryChange = useCallback(
    (index: number, comboVal: string) => {
      if (!comboVal) {
        form.setValue(`items.${index}.categoryComboVal`, "", { shouldDirty: true });
        form.setValue(`items.${index}.categoryId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.categoryName`, null, { shouldDirty: true });
        return;
      }
      form.setValue(`items.${index}.categoryComboVal`, comboVal, { shouldDirty: true });
      if (comboVal.startsWith(NEW_ITEM_PREFIX)) {
        // Pending-new category: store the name, leave categoryId null (resolved on save)
        const name = comboVal.slice(NEW_ITEM_PREFIX.length);
        form.setValue(`items.${index}.categoryId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.categoryName`, name, { shouldDirty: true });
      } else if (comboVal === NO_CATEGORY) {
        form.setValue(`items.${index}.categoryId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.categoryName`, null, { shouldDirty: true });
      } else {
        // Existing category selected by name — resolve its ID
        form.setValue(`items.${index}.categoryName`, comboVal, { shouldDirty: true });
        const currentBrandId = form.getValues(`items.${index}.brandId`);
        const catsWithName = allCategories.filter((c: { name: string }) => c.name === comboVal);
        const resolvedCat =
          catsWithName.find((c: { brandId?: number | null }) => (c.brandId ?? null) === currentBrandId) ??
          catsWithName[0];
        form.setValue(`items.${index}.categoryId`, resolvedCat?.id ?? null, { shouldDirty: true });
      }
      // Category changes are independent and never clear or auto-select Product.
    },
    [allCategories, form]
  );

  // ── Deferred brand/category creation (runs on Save Purchase, not inline) ─────
  //
  // Brand/category values prefixed with NEW_ITEM_PREFIX are "pending new" — they
  // live only in form state while the user is filling in the purchase. When the
  // user clicks Save Purchase the function below creates them in order:
  //   1. Create all pending brands → get real IDs.
  //   2. Create all pending categories with the *resolved* brand IDs → get real IDs.
  //   3. Patch any products in the items whose brand/category may have changed.
  // Draft saves skip this entirely — nothing is created until Save Purchase.

  const [isResolving, setIsResolving] = useState(false);

  async function resolveNewItemsAndGetPayload(values: FormValues): Promise<FormValues | null> {
    const NP = NEW_ITEM_PREFIX;
    let items = [...values.items];

    // ── 1. Create pending brands (deduplicated by comboVal key) ───────────────
    const brandKeyToId = new Map<string, number>(); // "__new__:X" → realId
    const pendingBrandKeys = [...new Set(items.filter(i => i.brandComboVal.startsWith(NP)).map(i => i.brandComboVal))];
    for (const bKey of pendingBrandKeys) {
      const name = bKey.slice(NP.length);
      try {
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json())?.message ?? res.statusText);
        const brand = await res.json();
        brandKeyToId.set(bKey, brand.id);
        toast.success(`Brand "${name}" created`);
      } catch (e: any) {
        toast.error(`Failed to create brand "${name}": ${e?.message ?? ""}`);
        return null;
      }
    }

    // ── 2. Resolve brandId in each item ──────────────────────────────────────
    items = items.map(item =>
      item.brandComboVal.startsWith(NP)
        ? { ...item, brandId: brandKeyToId.get(item.brandComboVal) ?? null }
        : item
    );

    // ── 3. Create pending categories (deduplicated by name+resolvedBrandId) ──
    const catKeyToId = new Map<string, number>(); // "name::brandId" → realId
    const seenCats = new Set<string>();
    const pendingCats: { comboVal: string; name: string; brandId: number | null }[] = [];
    for (const item of items) {
      if (item.categoryComboVal.startsWith(NP)) {
        const name = item.categoryComboVal.slice(NP.length);
        const brandId = item.brandId ?? null;
        const dedupeKey = `${name}::${brandId}`;
        if (!seenCats.has(dedupeKey)) {
          seenCats.add(dedupeKey);
          pendingCats.push({ comboVal: item.categoryComboVal, name, brandId });
        }
      }
    }
    for (const { name, brandId } of pendingCats) {
      try {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, brandId }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json())?.message ?? res.statusText);
        const cat = await res.json();
        catKeyToId.set(`${name}::${brandId}`, cat.id);
        toast.success(`Category "${name}" created`);
      } catch (e: any) {
        toast.error(`Failed to create category "${name}": ${e?.message ?? ""}`);
        return null;
      }
    }

    // ── 4. Resolve categoryId in each item ────────────────────────────────────
    items = items.map(item => {
      if (item.categoryComboVal.startsWith(NP)) {
        const name = item.categoryComboVal.slice(NP.length);
        const brandId = item.brandId ?? null;
        return { ...item, categoryId: catKeyToId.get(`${name}::${brandId}`) ?? null };
      }
      return item;
    });

    // ── 5. Create pending products (deferred, sequential to avoid SKU collisions) ─
    const productKeyToId = new Map<string, number>(); // "__new__:X" → realId
    const pendingProductKeys = [...new Set(items.filter(i => i.productComboVal?.startsWith(NP)).map(i => i.productComboVal!))];
    for (const pKey of pendingProductKeys) {
      const name = pKey.slice(NP.length);
      // Fetch next SKU right before each creation so sequential creates don't collide
      let sku = "PROD-001";
      try {
        const skuRes = await fetch("/api/products/next-sku", { credentials: "include" });
        if (skuRes.ok) { const { sku: s } = await skuRes.json(); sku = s; }
      } catch {}
      // Use the first item that references this product for its details
      const srcItem = items.find(i => i.productComboVal === pKey)!;
      const purchasePrice = Number(srcItem.purchasePrice) || 0;
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            sku,
            unit: srcItem.unit,
            purchasePrice,
            sellingPrice: purchasePrice,
            wholesalePrice: purchasePrice,
            retailPrice: purchasePrice,
            gstPercent: Number(srcItem.gstPercent) || 0,
            currentStock: 0, // purchase save will add the quantity to stock
            minStock: 0,
            brandId: srcItem.brandId ?? null,
            categoryId: srcItem.categoryId ?? null,
            status: "active",
          }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json())?.message ?? res.statusText);
        const product = await res.json();
        productKeyToId.set(pKey, product.id);
        toast.success(`Product "${name}" created`);
      } catch (e: any) {
        toast.error(`Failed to create product "${name}": ${e?.message ?? ""}`);
        return null;
      }
    }

    // ── 6. Resolve productId in each item ─────────────────────────────────────
    items = items.map(item =>
      item.productComboVal?.startsWith(NP)
        ? { ...item, productId: productKeyToId.get(item.productComboVal!) ?? 0 }
        : item
    );

    if (productKeyToId.size > 0) queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

    // ── 7. Patch existing products whose brand/category changed (best-effort) ──
    if (brandKeyToId.size > 0 || catKeyToId.size > 0) {
      await Promise.allSettled(
        items
          .filter(item => (item.productId ?? 0) > 0 && !productKeyToId.has(item.productComboVal ?? ""))
          .map(item =>
            fetch(`/api/products/${item.productId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ brandId: item.brandId ?? null, categoryId: item.categoryId ?? null }),
              credentials: "include",
            }).catch(() => {})
          )
      );
    }

    if (brandKeyToId.size > 0) queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
    if (catKeyToId.size > 0) queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

    return { ...values, items };
  }

  const isSaving = isResolving || createMutation.isPending || createAndPrintMutation.isPending;
  const supplierSelected = Number(form.watch("supplierId")) > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
           onClick={() => setLocation("/inventory/purchases")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Purchase</h1>
          <p className="text-muted-foreground text-sm">
            Record a supplier purchase bill. Stock is increased on save.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          {/* ── Header section ─────────────────────────────────────────────────── */}
          <div className="rounded-lg border bg-card shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-base">Purchase Details</h2>
            <div className="flex items-center gap-2 mb-1">
              <Checkbox
                id="withGST"
                checked={withGST}
                onCheckedChange={(v) => setWithGST(Boolean(v))}
              />
              <label htmlFor="withGST" className="text-sm cursor-pointer select-none">
                With GST
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Purchase ID - read only */}
              <div className="space-y-2">
                <Label>Purchase ID</Label>
                <Input value="Auto-generated (ACTP-XXXXXX)" disabled className="bg-muted/50 text-muted-foreground" />
              </div>

              {/* Purchase Date */}
              <FormField
                control={form.control}
                name="purchaseDate"
                render={({ field, fieldState }) => (
                  <FormItem {...(fieldState.error ? { "data-field-error": true } : {})}>
                    <FormLabel>Purchase Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Supplier */}
              <div className="space-y-2" id="field-supplierId">
                <Label>Supplier <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <FormField
                      control={form.control}
                      name="supplierId"
                      render={({ field, fieldState }) => (
                        <FormItem {...(fieldState.error ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={field.value ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(Number(v))}
                            options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
                            placeholder="Search supplier…"
                            searchPlaceholder="Type to search…"
                            buttonClassName="h-10 text-sm px-3"
                            popoverWidth="w-72"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddSupplierOpen(true)}
                    className="shrink-0 text-xs px-3 h-10"
                  >
                    + New
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Items table ────────────────────────────────────────────────────── */}
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b gap-2">
              <h2 className="font-semibold text-base">Purchase Items</h2>
              <div className="flex items-center gap-2">
                {someSelected && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Selected ({selectedIds.size})
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => append(emptyItem())}
                >
                  <Plus className="h-3 w-3" /> Add Product
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div
                className="overflow-y-auto"
                style={{ maxHeight: "min(calc(100vh - 480px), 420px)" }}
              >
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 w-[36px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all items"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[140px]">Brand <span className="text-destructive">*</span></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[140px]">Category <span className="text-destructive">*</span></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[160px]">Product <span className="text-destructive">*</span></th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[80px]">Qty <span className="text-destructive">*</span></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[90px]">Unit <span className="text-destructive">*</span></th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[110px]">Price <span className="text-destructive">*</span></th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[90px]">Disc %</th>
                    {withGST && <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[70px] text-xs">GST %</th>}
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground min-w-[100px]">Total</th>
                    <th className="w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const item = watchedItems[index];
                    const brandComboVal = item?.brandComboVal ?? "";
                    const categoryComboVal = item?.categoryComboVal ?? "";

                    // Brand options — ALL brands. SearchableSelect auto-prepends the pending-new
                    // entry itself, so do NOT add it here (would cause a duplicate with two ticks).
                    const brandOptions = [
                      { value: NO_BRAND, label: "No Brand" },
                      ...allBrands.map((b) => ({ value: String(b.id), label: b.name })),
                    ];

                    // Category options — ALL categories (deduplicated by name); append pending-new entry
                    const categoryOptions = (() => {
                      const seen = new Set<string>();
                      const deduped = allCategories.filter((c) => {
                        if (seen.has(c.name)) return false;
                        seen.add(c.name);
                        return true;
                      });
                      const opts = [
                        { value: NO_CATEGORY, label: "No Category" },
                        ...deduped.map((c) => ({ value: c.name, label: c.name })),
                      ];
                      // SearchableSelect auto-prepends the pending-new entry itself — don't add it here.
                      return opts;
                    })();

                    // Product options intentionally remain unfiltered. Brand and category are
                    // independent selections; choosing either one must not hide products.
                    const productComboVal = item?.productComboVal ?? "";
                    const isPendingNewProduct = productComboVal.startsWith(NEW_ITEM_PREFIX);
                    // SearchableSelect auto-prepends the pending-new entry when value starts with __new__:
                    // so we only pass existing products here (no duplication)
                    const productOptions = allProducts.map((p) => ({
                      value: String(p.id),
                      label: p.name,
                    }));
                    const rowErrors = hasAttemptedSave ? form.formState.errors.items?.[index] : undefined;

                    const lineBase =
                      (Number(item?.quantity) || 0) * (Number(item?.purchasePrice) || 0);
                    const discountPercent = Number(item?.discountPercent) || 0;
                    const lineDiscount = lineBase * (discountPercent / 100);
                    const lineTotal = lineBase - lineDiscount;
                    const gstAmt = lineTotal * ((Number(item?.gstPercent) || 0) / 100);

                    return (
                      <tr key={field.id} id={`item-row-${index}`} className={cn("hover:bg-muted/20", selectedIds.has(field.id) && "bg-muted/30")}>
                        {/* Checkbox */}
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={selectedIds.has(field.id)}
                            onCheckedChange={() => toggleSelect(field.id)}
                            aria-label={`Select item ${index + 1}`}
                          />
                        </td>
                        {/* Brand */}
                        <td className="px-2 py-2"
                          {...(rowErrors?.brandComboVal ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={brandComboVal}
                            onValueChange={(v) => handleBrandChange(index, v)}
                            options={brandOptions}
                            placeholder="Select brand…"
                            searchPlaceholder="Search or add brand…"
                            disabled={!supplierSelected}
                            buttonClassName={rowErrors?.brandComboVal ? "border-destructive" : ""}
                            allowCreate
                            maxLength={70}
                          />
                          {rowErrors?.brandComboVal && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {rowErrors.brandComboVal.message}
                            </p>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-2 py-2"
                          {...(rowErrors?.categoryComboVal ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={categoryComboVal}
                            onValueChange={(v) => handleCategoryChange(index, v)}
                            options={categoryOptions}
                            placeholder="Select category…"
                            searchPlaceholder="Search or add category…"
                            disabled={!supplierSelected}
                            buttonClassName={rowErrors?.categoryComboVal ? "border-destructive" : ""}
                            allowCreate
                            maxLength={70}
                          />
                          {rowErrors?.categoryComboVal && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {rowErrors.categoryComboVal.message}
                            </p>
                          )}
                        </td>

                        {/* Product */}
                        <td className="px-2 py-2"
                          {...(rowErrors?.productComboVal ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={productComboVal}
                            onValueChange={(v) => handleProductChange(index, v)}
                            options={productOptions}
                            placeholder="Select product…"
                            searchPlaceholder="Search or add product…"
                            disabled={!supplierSelected}
                            buttonClassName={rowErrors?.productComboVal ? "border-destructive" : ""}
                            allowCreate
                            maxLength={80}
                            allowedCharsPattern={/^[a-zA-Z0-9 \-\/&().'+ ]$/}
                          />
                          {rowErrors?.productComboVal && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {(rowErrors as any).productComboVal?.message}
                            </p>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={1}
                            className="h-8 text-xs text-right"
                            disabled={!supplierSelected}
                            {...form.register(`items.${index}.quantity`)}
                          />
                        </td>

                        {/* Unit — auto-filled from existing product (read-only); editable for new products */}
                        <td className="px-2 py-2">
                          <UnitSelect
                            value={item?.unit ?? ""}
                            onChange={(u) => form.setValue(`items.${index}.unit`, u, { shouldDirty: true })}
                            error={rowErrors?.unit?.message}
                            compact
                            disabled={!supplierSelected || (!isPendingNewProduct && productComboVal !== "")}
                          />
                        </td>

                        {/* Purchase Price + prev-price indicator + update-price checkbox */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-xs text-right"
                            disabled={!supplierSelected}
                            {...form.register(`items.${index}.purchasePrice`)}
                          />
                          {item?.prevPurchasePrice != null && (
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground leading-none">
                                Prev: {fmt(item.prevPurchasePrice)}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <Checkbox
                                  id={`updatePrice-${index}`}
                                  checked={!!item.updatePrice}
                                  onCheckedChange={(v) =>
                                    form.setValue(`items.${index}.updatePrice`, Boolean(v), { shouldDirty: true })
                                  }
                                  className="h-3 w-3"
                                />
                                <label
                                  htmlFor={`updatePrice-${index}`}
                                  className="text-[10px] cursor-pointer text-muted-foreground whitespace-nowrap leading-none"
                                >
                                  Update
                                </label>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Item Discount Percentage */}
                        <td className="px-2 py-2">
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              placeholder="0"
                              className="h-8 pr-5 text-xs text-right"
                              disabled={!supplierSelected}
                              {...form.register(`items.${index}.discountPercent`)}
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                          </div>
                          {rowErrors?.discountPercent && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {rowErrors.discountPercent.message}
                            </p>
                          )}
                        </td>

                        {/* GST % */}
                        {withGST && (
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 text-xs text-right"
                              disabled={!supplierSelected}
                              {...form.register(`items.${index}.gstPercent`)}
                            />
                          </td>
                        )}

                        {/* Total */}
                        <td className="px-2 py-2 text-right">
                          <div className="text-xs font-medium pr-1 whitespace-nowrap">
                            {fmt(withGST ? lineTotal + gstAmt : lineTotal)}
                          </div>
                          {withGST && (
                            <div className="text-[10px] text-muted-foreground pr-1 leading-tight">
                              <span className="whitespace-nowrap">{fmt(lineTotal)}</span>
                              {" + "}
                              <span className="whitespace-nowrap">{fmt(gstAmt)} GST</span>
                            </div>
                          )}
                        </td>

                        {/* Remove */}
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              remove(index);
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(field.id);
                                return next;
                              });
                            }}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {form.formState.errors.items?.root && (
              <p className="text-sm text-destructive px-4 pb-3">
                {form.formState.errors.items.root.message}
              </p>
            )}
          </div>

          {/* ── Charges + Summary ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Additional Charges */}
            <div className="rounded-lg border bg-card shadow-sm p-6 space-y-3">
              <h2 className="font-semibold text-base">Additional Charges</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Packing Charges</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" disabled={!supplierSelected} {...form.register("packingCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Transport Charges</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" disabled={!supplierSelected} {...form.register("transportCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Loading / Unloading</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" disabled={!supplierSelected} {...form.register("loadingCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Other Charges</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" disabled={!supplierSelected} {...form.register("otherCharges")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Discount</Label>
                <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" disabled={!supplierSelected} {...form.register("discount")} />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg border bg-card shadow-sm p-6 space-y-3">
              <h2 className="font-semibold text-base">Summary</h2>
              <div className="space-y-2 text-sm">
                {/* Step 1 — Subtotal */}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{fmt(subtotal)}</span>
                </div>

                {/* Step 2 — Discount */}
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>− {fmt(discount)}</span>
                    </div>
                    <div className="flex justify-between bg-muted/40 rounded px-2 py-1">
                      <span className="text-muted-foreground text-xs">After Discount</span>
                      <span className="font-medium">{fmt(afterDiscount)}</span>
                    </div>
                  </>
                )}

                {/* Step 3 — GST */}
                {withGST && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST Total</span>
                      <span className="font-medium">+ {fmt(gstTotal)}</span>
                    </div>
                    <div className="flex justify-between bg-muted/40 rounded px-2 py-1">
                      <span className="text-muted-foreground text-xs">After GST</span>
                      <span className="font-medium">{fmt(afterGST)}</span>
                    </div>
                  </>
                )}

                {/* Step 4 — Additional Charges */}
                {additionalCharges > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Additional Charges</span>
                      <span className="font-medium">+ {fmt(additionalCharges)}</span>
                    </div>
                    <div className="flex justify-between bg-muted/40 rounded px-2 py-1">
                      <span className="text-muted-foreground text-xs">After Charges</span>
                      <span className="font-medium">{fmt(grandTotal)}</span>
                    </div>
                  </>
                )}

                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Grand Total</span>
                  <span className="text-primary">{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Action buttons ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={saveDraft}
              disabled={isSaving}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Save as Draft
            </Button>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/inventory/purchases")}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={form.handleSubmit(onSaveAndPrint, onInvalid)}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                {isSaving ? "Saving…" : "Save & Print"}
              </Button>
              <Button
                type="button"
                disabled={isSaving}
                onClick={form.handleSubmit(onSave, onInvalid)}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving…" : "Save Purchase"}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {/* Add supplier dialog */}
      <AddSupplierDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        onCreated={(id) => form.setValue("supplierId", id, { shouldDirty: true, shouldValidate: true })}
      />

      <AlertDialog
        open={confirmExitOpen}
        onOpenChange={(open) => {
          setConfirmExitOpen(open);
          if (!open) setPendingNavigation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              You have entered purchase details that have not been saved. Would you like to move this bill to drafts or cancel the purchase?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              className="border bg-background text-foreground hover:bg-muted"
              onClick={saveDraftAndLeave}
            >
              Move to Draft
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={discardAndLeave}
            >
              Cancel Purchase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
