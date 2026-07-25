import { useState, useEffect, useCallback, useRef } from "react";
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
  useCreateBrand,
  useCreateCategory,
  useCreateProduct,
  useUpdateProduct,
  getListPurchasesQueryKey,
  getListSuppliersQueryKey,
  getListBrandsQueryKey,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigationGuard, useBeforeUnload } from "@/components/navigation-guard";
import { readDrafts, upsertDraft, removeDraft, type PurchaseDraft } from "@/lib/purchase-drafts";
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
import { Trash2, Plus, ArrowLeft, Printer, Save, Check, ChevronsUpDown, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────────
// Searchable select for table cells
// ────────────────────────────────────────────────────────────────────────────────

const NO_BRAND = "no-brand";
const NO_CATEGORY = "no-category";

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

// ── Searchable select for table cells (supports optional inline "Add new") ────

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  buttonClassName,
  popoverWidth = "w-48",
  onCreate,
  isCreating,
  staticAddLabel,
  onStaticAdd,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  buttonClassName?: string;
  popoverWidth?: string;
  /** Called with the typed text to create a new item inline (brand / category) */
  onCreate?: (name: string) => void;
  isCreating?: boolean;
  /** Always-visible "Add new …" button (for product) */
  staticAddLabel?: string;
  onStaticAdd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

  const trimmed = search.trim();
  const notExists = !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = !!onCreate && trimmed.length >= 1 && notExists;

  function handleSelect(val: string) {
    onValueChange(val);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("h-8 w-full justify-between px-2 text-xs font-normal overflow-hidden", buttonClassName)}
        >
          <span className={cn("truncate min-w-0 flex-1 text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", popoverWidth)} align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-48 overflow-y-auto">
            {/* Static "Add new product" button — always visible */}
            {staticAddLabel && onStaticAdd && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__static_add__"
                    onSelect={() => { setOpen(false); setSearch(""); onStaticAdd(); }}
                    className="text-xs text-primary font-medium"
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    {staticAddLabel}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {/* Inline "Add 'X'" for brand / category */}
            {canCreate && (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => { setOpen(false); setSearch(""); onCreate!(trimmed); }}
                    className="text-xs text-primary font-medium"
                    disabled={isCreating}
                  >
                    <Plus className="mr-2 h-3 w-3" />
                    {isCreating ? "Adding…" : `Add "${trimmed}"`}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {options.filter((o) =>
              !search || o.label.toLowerCase().includes(search.toLowerCase())
            ).length === 0 && !canCreate ? (
              <div className="py-2 text-xs text-center text-muted-foreground">No results.</div>
            ) : (
              <CommandGroup>
                {options
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
}: {
  value: string;
  onChange: (unit: string) => void;
  error?: string;
  compact?: boolean;
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
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn(
              "w-full justify-between font-normal text-left overflow-hidden",
              compact ? "h-8 px-2 text-xs" : "h-9 text-sm",
              error && "border-destructive"
            )}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || "Select unit…"}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-44" align="start" sideOffset={4}>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or add…"
              value={search}
              onValueChange={setSearch}
              className="h-8 text-xs"
            />
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
              {!canAdd && trimmed.length > 0 && (hasWhitespace || tooLong) && (
                <div className="px-3 py-2 text-xs text-destructive">
                  {hasWhitespace ? "No spaces allowed" : "Max 10 chars"}
                </div>
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

// ── New Product mini-dialog ───────────────────────────────────────────────────

const newProductSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(80),
  purchasePrice: z.coerce.number().min(0, "Required"),
  sellingPrice: z.coerce.number().min(0),
  wholesalePrice: z.coerce.number().min(0),
  gstPercent: z.coerce.number().min(0).max(100),
});
type NewProductValues = z.infer<typeof newProductSchema>;

function NewProductDialog({
  open,
  onOpenChange,
  defaultBrandId,
  defaultCategoryId,
  defaultPurchasePrice,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultBrandId?: number | null;
  defaultCategoryId?: number | null;
  defaultPurchasePrice?: number;
  onCreated: (product: { id: number; name: string; purchasePrice: number; unit: string; gstPercent: number }) => void;
}) {
  const queryClient = useQueryClient();
  const [unit, setUnit] = useState("");
  const [unitError, setUnitError] = useState<string | undefined>();
  const [skuLoading, setSkuLoading] = useState(false);
  const [sku, setSku] = useState("");

  const form = useForm<NewProductValues>({
    resolver: zodResolver(newProductSchema),
    defaultValues: { name: "", purchasePrice: defaultPurchasePrice ?? 0, sellingPrice: 0, wholesalePrice: 0, gstPercent: 0 },
  });

  useEffect(() => {
    if (!open) return;
    setUnit("");
    setUnitError(undefined);
    form.reset({ name: "", purchasePrice: defaultPurchasePrice ?? 0, sellingPrice: 0, wholesalePrice: 0, gstPercent: 0 });
    setSkuLoading(true);
    fetch("/api/products/next-sku")
      .then(r => r.json())
      .then(({ sku: s }) => setSku(s))
      .catch(() => setSku("SKU-001"))
      .finally(() => setSkuLoading(false));
  }, [open, defaultPurchasePrice, form]);

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: (product) => {
        toast.success(`Product "${product.name}" created`);
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        onCreated({ id: product.id, name: product.name, purchasePrice: product.purchasePrice, unit: product.unit, gstPercent: product.gstPercent });
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to create product"),
    },
  });

  function onSubmit(values: NewProductValues) {
    if (!unit) { setUnitError("Unit is required"); return; }
    setUnitError(undefined);
    createMutation.mutate({
      data: {
        ...values,
        sku,
        unit,
        sellingPrice: values.sellingPrice || values.purchasePrice,
        wholesalePrice: values.wholesalePrice || values.purchasePrice,
        retailPrice: values.sellingPrice || values.purchasePrice,
        currentStock: 0,
        minStock: 0,
        brandId: defaultBrandId ?? null,
        categoryId: defaultCategoryId ?? null,
        status: "active",
      } as any,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
          <DialogDescription>Create a new product. You can edit full details later in Inventory.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="e.g. HDPE Rope 10mm" maxLength={80} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">SKU</Label>
                <Input value={skuLoading ? "Generating…" : sku} readOnly className="bg-muted/50 text-muted-foreground text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Unit <span className="text-destructive">*</span></Label>
                <UnitSelect value={unit} onChange={setUnit} error={unitError} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Price <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sellingPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Selling Price</FormLabel>
                  <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="wholesalePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Wholesale Price</FormLabel>
                  <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gstPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel>GST %</FormLabel>
                  <FormControl><Input type="number" min={0} max={100} step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Form schema
// ────────────────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  productId: z.coerce.number().min(1, "Product required"),
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
  itemDiscount: z.coerce.number().min(0).optional(),
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
  itemDiscount: 0,
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
  // Inline brand/category creation
  const pendingRowRef = useRef<number>(-1);
  // New product dialog
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductRowIndex, setNewProductRowIndex] = useState(-1);
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
    return acc + (Number(item.itemDiscount) || 0);
  }, 0);

  const gstTotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    const disc = Number(item.itemDiscount) || 0;
    const gst = Number(item.gstPercent) || 0;
    const base = qty * price - disc;
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

  // Flush any "update price" requests for items where checkbox is ticked
  async function flushPriceUpdates() {
    const items = form.getValues("items");
    const toUpdate = items.filter((i) => i.updatePrice && Number(i.productId) > 0);
    if (toUpdate.length === 0) return;
    await Promise.allSettled(
      toUpdate.map((i) =>
        fetch(`/api/products/${i.productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchasePrice: Number(i.purchasePrice) }),
        })
      )
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

  function onSave(values: FormValues) {
    createMutation.mutate({ data: buildPayload(values) });
  }

  function onSaveAndPrint(values: FormValues) {
    createAndPrintMutation.mutate({ data: buildPayload(values) });
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
    if (errors.supplierId) { scrollAndFocus("field-supplierId"); return; }
    if (errors.purchaseDate) { form.setFocus("purchaseDate"); return; }
    if (errors.items) {
      const itemErrors: any[] = errors.items;
      for (let i = 0; i < itemErrors.length; i++) {
        const row = itemErrors[i];
        if (!row) continue;
        if (row.brandComboVal || row.categoryComboVal || row.productId) {
          scrollAndFocus(`item-row-${i}`); return;
        }
        if (row.quantity) { form.setFocus(`items.${i}.quantity`); return; }
        if (row.purchasePrice) { form.setFocus(`items.${i}.purchasePrice`); return; }
      }
    }
  }

  // ── Per-row cascading logic ───────────────────────────────────────────────────

  const handleProductChange = useCallback(
    (index: number, productId: string) => {
      const pid = Number(productId);
      const product = allProducts.find((p: { id: number }) => p.id === pid);
      if (!product) return;

      const brand = allBrands.find((b: { id: number }) => b.id === product.brandId);
      const category = allCategories.find((c: { id: number }) => c.id === product.categoryId);

      const prevPrice = parseFloat(String(product.purchasePrice ?? 0));
      form.setValue(`items.${index}.productId`, pid, { shouldDirty: true });
      form.setValue(`items.${index}.currentStock`, product.currentStock ?? 0, { shouldDirty: true });
      form.setValue(`items.${index}.unit`, product.unit ?? "", { shouldDirty: true });
      form.setValue(`items.${index}.purchasePrice`, prevPrice, { shouldDirty: true });
      form.setValue(`items.${index}.gstPercent`, parseFloat(String(product.gstPercent ?? 0)), { shouldDirty: true });
      form.setValue(`items.${index}.prevPurchasePrice`, prevPrice, { shouldDirty: true });
      form.setValue(`items.${index}.updatePrice`, false, { shouldDirty: true });
      // Auto-fill brand
      const brandCombo = product.brandId ? String(product.brandId) : NO_BRAND;
      form.setValue(`items.${index}.brandComboVal`, brandCombo, { shouldDirty: true, shouldValidate: true });
      form.setValue(`items.${index}.brandId`, product.brandId ?? null, { shouldDirty: true });
      form.setValue(`items.${index}.brandName`, brand?.name ?? null, { shouldDirty: true });
      // Auto-fill category — use name as comboVal (deduplication key)
      const catCombo = category?.name ?? NO_CATEGORY;
      form.setValue(`items.${index}.categoryComboVal`, catCombo, { shouldDirty: true, shouldValidate: true });
      form.setValue(`items.${index}.categoryId`, product.categoryId ?? null, { shouldDirty: true });
      form.setValue(`items.${index}.categoryName`, category?.name ?? null, { shouldDirty: true });
    },
    [allProducts, allBrands, allCategories, form]
  );

  const handleBrandChange = useCallback(
    (index: number, comboVal: string) => {
      const bid = comboVal === NO_BRAND ? null : Number(comboVal) || null;
      const brand = allBrands.find((b: { id: number }) => b.id === bid);
      form.setValue(`items.${index}.brandComboVal`, comboVal, { shouldDirty: true, shouldValidate: true });
      form.setValue(`items.${index}.brandId`, bid, { shouldDirty: true });
      form.setValue(`items.${index}.brandName`, brand?.name ?? null, { shouldDirty: true });
      // Category selection is independent — leave it untouched.
      // Only clear the product so user re-selects under the new brand.
      form.setValue(`items.${index}.productId`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.currentStock`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.unit`, "", { shouldDirty: true });
      form.setValue(`items.${index}.purchasePrice`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.gstPercent`, 0, { shouldDirty: true });
    },
    [allBrands, form]
  );

  const handleCategoryChange = useCallback(
    (index: number, comboVal: string) => {
      // comboVal is the category NAME (deduplication key), or NO_CATEGORY
      form.setValue(`items.${index}.categoryComboVal`, comboVal, { shouldDirty: true, shouldValidate: true });
      if (comboVal === NO_CATEGORY) {
        form.setValue(`items.${index}.categoryId`, null, { shouldDirty: true });
        form.setValue(`items.${index}.categoryName`, null, { shouldDirty: true });
      } else {
        form.setValue(`items.${index}.categoryName`, comboVal, { shouldDirty: true });
        // Resolve categoryId: prefer one matching the currently selected brand, else first match
        const currentBrandId = form.getValues(`items.${index}.brandId`);
        const catsWithName = allCategories.filter((c: { name: string }) => c.name === comboVal);
        const resolvedCat =
          catsWithName.find((c: { brandId: number | null }) => c.brandId === currentBrandId) ??
          catsWithName[0];
        form.setValue(`items.${index}.categoryId`, resolvedCat?.id ?? null, { shouldDirty: true });
      }
      // Brand selection is independent — leave it untouched.
      // Only clear the product so user re-selects under the new category.
      form.setValue(`items.${index}.productId`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.currentStock`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.unit`, "", { shouldDirty: true });
      form.setValue(`items.${index}.purchasePrice`, 0, { shouldDirty: true });
      form.setValue(`items.${index}.gstPercent`, 0, { shouldDirty: true });
    },
    [allCategories, form]
  );

  // ── Inline brand/category creation ───────────────────────────────────────────

  const createBrandMutation = useCreateBrand({
    mutation: {
      onSuccess: (brand) => {
        const idx = pendingRowRef.current;
        pendingRowRef.current = -1;
        toast.success(`Brand "${brand.name}" created`);
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
        if (idx >= 0) handleBrandChange(idx, String(brand.id));
      },
      onError: (e: any) => { pendingRowRef.current = -1; toast.error(e?.message ?? "Failed to create brand"); },
    },
  });

  const createCategoryMutation = useCreateCategory({
    mutation: {
      onSuccess: (cat) => {
        const idx = pendingRowRef.current;
        pendingRowRef.current = -1;
        toast.success(`Category "${cat.name}" created`);
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        if (idx >= 0) {
          // Set values directly from the fresh mutation response — don't go through
          // handleCategoryChange, which reads allCategories from the React Query cache
          // that hasn't refreshed yet (new entry missing → brand gets wrongly cleared).
          form.setValue(`items.${idx}.categoryComboVal`, cat.name, { shouldDirty: true, shouldValidate: true });
          form.setValue(`items.${idx}.categoryId`, cat.id, { shouldDirty: true });
          form.setValue(`items.${idx}.categoryName`, cat.name, { shouldDirty: true });
          // Clear product so user re-selects; brand stays untouched.
          form.setValue(`items.${idx}.productId`, 0, { shouldDirty: true });
          form.setValue(`items.${idx}.currentStock`, 0, { shouldDirty: true });
          form.setValue(`items.${idx}.unit`, "", { shouldDirty: true });
          form.setValue(`items.${idx}.purchasePrice`, 0, { shouldDirty: true });
          form.setValue(`items.${idx}.gstPercent`, 0, { shouldDirty: true });
        }
      },
      onError: (e: any) => { pendingRowRef.current = -1; toast.error(e?.message ?? "Failed to create category"); },
    },
  });

  const isSaving = createMutation.isPending || createAndPrintMutation.isPending;
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
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[90px]">Disc</th>
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

                    // Brand options — show ALL brands regardless of category selection.
                    // Cross-filtering was removed: selecting a brand/category only filters products.
                    const brandOptions = [
                      { value: NO_BRAND, label: "No Brand" },
                      ...allBrands.map((b) => ({ value: String(b.id), label: b.name })),
                    ];

                    // Category options — show ALL categories (deduplicated by name), regardless of brand.
                    const categoryOptions = (() => {
                      const seen = new Set<string>();
                      const deduped = allCategories.filter((c) => {
                        if (seen.has(c.name)) return false;
                        seen.add(c.name);
                        return true;
                      });
                      return [
                        { value: NO_CATEGORY, label: "No Category" },
                        ...deduped.map((c) => ({ value: c.name, label: c.name })),
                      ];
                    })();

                    // Product options — filter by brand and/or category
                    // categoryComboVal is now a name; use resolved categoryId when available,
                    // otherwise match any category record sharing that name.
                    const filteredProducts = allProducts.filter((p) => {
                      const brandOk = !brandComboVal || (
                        brandComboVal === NO_BRAND ? !p.brandId : p.brandId === Number(brandComboVal)
                      );
                      const catOk = !categoryComboVal || (
                        categoryComboVal === NO_CATEGORY
                          ? !p.categoryId
                          : item?.categoryId
                            ? p.categoryId === item.categoryId
                            : allCategories
                                .filter((c: { name: string }) => c.name === categoryComboVal)
                                .some((c: { id: number }) => c.id === p.categoryId)
                      );
                      return brandOk && catOk;
                    });
                    const productOptions = filteredProducts.map((p) => ({
                      value: String(p.id),
                      label: p.name,
                    }));

                    const lineBase =
                      (Number(item?.quantity) || 0) * (Number(item?.purchasePrice) || 0);
                    const lineDisc = Number(item?.itemDiscount) || 0;
                    const lineTotal = lineBase - lineDisc;
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
                          {...(form.formState.errors.items?.[index]?.brandComboVal ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={brandComboVal}
                            onValueChange={(v) => handleBrandChange(index, v)}
                            options={brandOptions}
                            placeholder="Select brand…"
                            searchPlaceholder="Search or add brand…"
                            disabled={!supplierSelected}
                            buttonClassName={form.formState.errors.items?.[index]?.brandComboVal ? "border-destructive" : ""}
                            onCreate={(name) => {
                              pendingRowRef.current = index;
                              createBrandMutation.mutate({ data: { name } });
                            }}
                            isCreating={createBrandMutation.isPending && pendingRowRef.current === index}
                          />
                          {form.formState.errors.items?.[index]?.brandComboVal && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {form.formState.errors.items[index].brandComboVal.message}
                            </p>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-2 py-2"
                          {...(form.formState.errors.items?.[index]?.categoryComboVal ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={categoryComboVal}
                            onValueChange={(v) => handleCategoryChange(index, v)}
                            options={categoryOptions}
                            placeholder="Select category…"
                            searchPlaceholder="Search or add category…"
                            disabled={!supplierSelected}
                            buttonClassName={form.formState.errors.items?.[index]?.categoryComboVal ? "border-destructive" : ""}
                            onCreate={(name) => {
                              const brandId = form.getValues(`items.${index}.brandId`);
                              pendingRowRef.current = index;
                              createCategoryMutation.mutate({ data: { name, brandId: brandId ?? null } });
                            }}
                            isCreating={createCategoryMutation.isPending && pendingRowRef.current === index}
                          />
                          {form.formState.errors.items?.[index]?.categoryComboVal && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {form.formState.errors.items[index].categoryComboVal.message}
                            </p>
                          )}
                        </td>

                        {/* Product */}
                        <td className="px-2 py-2"
                          {...(form.formState.errors.items?.[index]?.productId ? { "data-field-error": true } : {})}>
                          <SearchableSelect
                            value={item?.productId ? String(item.productId) : ""}
                            onValueChange={(v) => handleProductChange(index, v)}
                            options={productOptions}
                            placeholder="Select product…"
                            searchPlaceholder="Search products…"
                            disabled={!supplierSelected}
                            buttonClassName={form.formState.errors.items?.[index]?.productId ? "border-destructive" : ""}
                            staticAddLabel="+ New Product"
                            onStaticAdd={() => { setNewProductRowIndex(index); setNewProductOpen(true); }}
                          />
                          {form.formState.errors.items?.[index]?.productId && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              {form.formState.errors.items[index].productId.message}
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

                        {/* Unit — editable combobox; auto-filled from product, user can override */}
                        <td className="px-2 py-2">
                          <UnitSelect
                            value={item?.unit ?? ""}
                            onChange={(u) => form.setValue(`items.${index}.unit`, u, { shouldDirty: true, shouldValidate: true })}
                            error={form.formState.errors.items?.[index]?.unit?.message}
                            compact
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

                        {/* Item Discount */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0"
                            className="h-8 text-xs text-right"
                            disabled={!supplierSelected}
                            {...form.register(`items.${index}.itemDiscount`)}
                          />
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

      {/* New product dialog */}
      <NewProductDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        defaultBrandId={newProductRowIndex >= 0 ? form.getValues(`items.${newProductRowIndex}.brandId`) : null}
        defaultCategoryId={newProductRowIndex >= 0 ? form.getValues(`items.${newProductRowIndex}.categoryId`) : null}
        defaultPurchasePrice={newProductRowIndex >= 0 ? Number(form.getValues(`items.${newProductRowIndex}.purchasePrice`)) || 0 : 0}
        onCreated={(product) => {
          const idx = newProductRowIndex;
          if (idx < 0) return;
          form.setValue(`items.${idx}.productId`, product.id, { shouldDirty: true, shouldValidate: true });
          form.setValue(`items.${idx}.purchasePrice`, product.purchasePrice, { shouldDirty: true });
          form.setValue(`items.${idx}.gstPercent`, product.gstPercent, { shouldDirty: true });
          form.setValue(`items.${idx}.unit`, product.unit, { shouldDirty: true });
          form.setValue(`items.${idx}.prevPurchasePrice`, null, { shouldDirty: true });
          form.setValue(`items.${idx}.updatePrice`, false, { shouldDirty: true });
          setNewProductRowIndex(-1);
        }}
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
