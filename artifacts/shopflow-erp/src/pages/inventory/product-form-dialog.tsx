import { useEffect, useState, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProduct,
  useUpdateProduct,
  useListCategories,
  useListBrands,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// ── Constants ────────────────────────────────────────────────────────────────
const NO_BRAND = "__no_brand__";
const UNITS_STORAGE_KEY = "shopflow-units";
const DEFAULT_UNITS = [
  "pc", "pcs", "kg", "g", "mg", "l", "ml",
  "box", "dozen", "pair", "set", "roll", "sheet", "bag", "bottle",
];
const LOCATIONS_STORAGE_KEY = "shopflow-locations";
const DEFAULT_LOCATIONS = [
  "A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2",
  "Rack1", "Rack2", "Shelf1", "Shelf2", "Floor1", "Floor2",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function getStoredUnits(): string[] {
  try {
    const stored = localStorage.getItem(UNITS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_UNITS;
}

function getStoredLocations(): string[] {
  try {
    const stored = localStorage.getItem(LOCATIONS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_LOCATIONS;
}

// Red asterisk for required fields
const Req = () => <span className="text-destructive ml-0.5">*</span>;

// ── Schema ───────────────────────────────────────────────────────────────────
const productSchema = z.object({
  name: z.string()
    .refine(s => s.trim().length >= 2, "At least 2 characters required")
    .refine(s => s.trim().length <= 80, "Max 80 characters")
    .refine(s => !/^\s+$/.test(s), "Cannot be only spaces")
    .refine(s => /^[a-zA-Z0-9 \-\/&().'+ ]+$/.test(s.trim()), "Only letters, numbers, spaces, and - / & ( ) . ' + are allowed"),
  sku:           z.string().min(1, "SKU is required"),
  barcode: z.string()
    .refine(s => !s || /^[a-zA-Z0-9]+$/.test(s), "No spaces or special characters allowed")
    .refine(s => !s || s.length >= 8, "Min 8 characters")
    .refine(s => !s || s.length <= 20, "Max 20 characters")
    .optional(),
  hsnCode: z.string()
    .refine(s => !s || /^[0-9]+$/.test(s), "Only digits 0–9 allowed")
    .refine(s => !s || s.length >= 4, "Min 4 digits")
    .refine(s => !s || s.length <= 8, "Max 8 digits")
    .optional(),
  brandId:       z.string().min(1, "Brand is required"),
  categoryId:    z.string().min(1, "Category is required"),
  gstPercent:    z.coerce.number().min(0).max(100),
  purchasePrice: z.coerce.number().min(0),
  wholesalePrice:z.coerce.number().min(0),
  retailPrice:   z.coerce.number().min(0),
  currentStock:  z.coerce.number().min(0),
  minStock:      z.coerce.number().min(0),
  location:      z.string().optional(),
  status:        z.enum(["active", "inactive"]),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface EditableProduct {
  id: number;
  name: string;
  sku: string;
  barcode?: string | null;
  hsnCode?: string | null;
  categoryId?: number | null;
  brandId?: number | null;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  gstPercent: number;
  unit: string;
  currentStock: number;
  minStock: number;
  location?: string | null;
  status?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const emptyValues: ProductFormValues = {
  name: "",
  sku: "",
  barcode: "",
  hsnCode: "",
  brandId: "",
  categoryId: "",
  gstPercent: 0,
  purchasePrice: 0,
  wholesalePrice: 0,
  retailPrice: 0,
  currentStock: 0,
  minStock: 0,
  location: "",
  status: "active",
};

// ── Unit single-select component ──────────────────────────────────────────────
function UnitSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (unit: string) => void;
  error?: string;
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
  const addHint = trimmed.length > 0
    ? hasWhitespace ? "No spaces allowed"
    : tooLong ? "Max 10 characters"
    : null
    : null;

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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn(
              "w-full justify-between font-normal text-left h-9",
              error && "border-destructive"
            )}
          >
            {value ? (
              <span>{value}</span>
            ) : (
              <span className="text-muted-foreground">Search or select unit…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width]"
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or add unit…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {trimmed.length > 0 && (
                <>
                  <CommandGroup>
                    {canAdd ? (
                      <CommandItem value={`__add__${trimmed}`} onSelect={addUnit} className="text-primary font-medium">
                        <Plus className="mr-2 h-4 w-4" />
                        Add "{trimmed}"
                      </CommandItem>
                    ) : addHint ? (
                      <div className="px-3 py-2 text-xs text-destructive">{addHint}</div>
                    ) : null}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {filtered.length > 0 ? (
                <CommandGroup heading="Available Units">
                  {filtered.map(unit => (
                    <CommandItem key={unit} value={unit} onSelect={() => select(unit)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === unit ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {unit}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : trimmed.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No units found.</div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-[0.8rem] font-medium text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}

// ── Location single-select component ──────────────────────────────────────────
function LocationSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (loc: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [availableLocs, setAvailableLocs] = useState<string[]>(getStoredLocations);

  const filtered = availableLocs.filter(l =>
    l.toLowerCase().includes(search.toLowerCase())
  );
  const trimmed = search.trim();
  const hasWhitespace = /\s/.test(trimmed);
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const tooLong = trimmed.length > 30;
  const notExists = !availableLocs.some(l => l.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length >= 2 && !hasWhitespace && !tooLong && notExists;
  const addHint = trimmed.length > 0
    ? hasWhitespace ? "No spaces allowed"
    : tooLong ? "Max 30 characters"
    : tooShort ? "Min 2 characters"
    : null
    : null;

  function select(loc: string) {
    onChange(loc);
    setOpen(false);
    setSearch("");
  }

  function addLocation() {
    if (!trimmed || hasWhitespace || tooLong || tooShort) return;
    const updated = [...availableLocs, trimmed];
    setAvailableLocs(updated);
    try { localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
    select(trimmed);
  }

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn(
              "w-full justify-between font-normal text-left h-9",
              error && "border-destructive"
            )}
          >
            {value ? (
              <span>{value}</span>
            ) : (
              <span className="text-muted-foreground">Search or select location…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width]"
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or add location…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {trimmed.length > 0 && (
                <>
                  <CommandGroup>
                    {canAdd ? (
                      <CommandItem value={`__add__${trimmed}`} onSelect={addLocation} className="text-primary font-medium">
                        <Plus className="mr-2 h-4 w-4" />
                        Add "{trimmed}"
                      </CommandItem>
                    ) : addHint ? (
                      <div className="px-3 py-2 text-xs text-destructive">{addHint}</div>
                    ) : null}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {filtered.length > 0 ? (
                <CommandGroup heading="Available Locations">
                  {filtered.map(loc => (
                    <CommandItem key={loc} value={loc} onSelect={() => select(loc)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === loc ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {loc}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : trimmed.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No locations found.</div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-[0.8rem] font-medium text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}

// ── Searchable single-select combobox ─────────────────────────────────────────
function SearchableCombobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText = "No results found.",
  disabled,
}: {
  value: string | undefined;
  onValueChange: (val: string | undefined) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal text-left overflow-hidden"
        >
          <span className={cn("truncate min-w-0 flex-1", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width]"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value === value ? undefined : opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: EditableProduct | null;
}) {
  const isEditing = !!product;
  const queryClient = useQueryClient();
  const { data: categories } = useListCategories();
  const { data: brands } = useListBrands();

  const [brandComboValue, setBrandComboValue] = useState<string | undefined>(undefined);
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [unitError, setUnitError] = useState<string | undefined>();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [skuLoading, setSkuLoading] = useState(false);
  const [hasOpeningStock, setHasOpeningStock] = useState(false);
  const openingStockCheckId = useId();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    setUnitError(undefined);
    if (product) {
      const initBrand = product.brandId ? String(product.brandId) : NO_BRAND;
      setBrandComboValue(initBrand);
      const units = product.unit
        ? product.unit.split(",").map(u => u.trim()).filter(Boolean)
        : [];
      setSelectedUnit(units[0] ?? "");
      setSelectedLocation(product.location ?? "");
      form.reset({
        name:          product.name,
        sku:           product.sku,
        barcode:       product.barcode ?? "",
        hsnCode:       product.hsnCode ?? "",
        brandId:       initBrand ?? "",
        categoryId:    product.categoryId ? String(product.categoryId) : "",
        gstPercent:    product.gstPercent,
        purchasePrice: product.purchasePrice,
        wholesalePrice:product.wholesalePrice,
        retailPrice:   product.retailPrice,
        currentStock:  product.currentStock,
        minStock:      product.minStock,
        location:      product.location ?? "",
        status:        product.status === "inactive" ? "inactive" : "active",
      });
    } else {
      setBrandComboValue(undefined);
      setSelectedUnit("");
      setSelectedLocation("");
      setHasOpeningStock(false);
      form.reset({ ...emptyValues, sku: "" });
      setSkuLoading(true);
      fetch("/api/products/next-sku")
        .then(r => r.json())
        .then(({ sku }) => form.setValue("sku", sku, { shouldValidate: true }))
        .catch(() => form.setValue("sku", "SKU-001", { shouldValidate: true }))
        .finally(() => setSkuLoading(false));
    }
  }, [open, product, form]);

  // ── Options ────────────────────────────────────────────────────────────────
  const brandOptions = [
    { value: NO_BRAND, label: "No Brand" },
    ...(brands ?? []).map(b => ({ value: String(b.id), label: b.name })),
  ];

  const categoryOptions = (() => {
    if (!brandComboValue || brandComboValue === NO_BRAND) {
      return (categories ?? [])
        .filter(c => !c.brandId)
        .map(c => ({ value: String(c.id), label: c.name }));
    }
    const numericId = Number(brandComboValue);
    return (categories ?? [])
      .filter(c => c.brandId === numericId)
      .map(c => ({ value: String(c.id), label: c.name }));
  })();

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleBrandChange(val: string | undefined) {
    setBrandComboValue(val);
    form.setValue("brandId", val ?? "", { shouldValidate: true });
    form.setValue("categoryId", "", { shouldValidate: false });
  }

  function handleCategoryChange(val: string | undefined) {
    form.setValue("categoryId", val ?? "", { shouldValidate: true });
  }

  const invalidateProducts = () =>
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product created successfully");
        invalidateProducts();
        onOpenChange(false);
      },
      onError: (err: any) => toast.error(err?.message ?? "Failed to create product"),
    },
  });

  const updateMutation = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product updated successfully");
        invalidateProducts();
        onOpenChange(false);
      },
      onError: (err: any) => toast.error(err?.message ?? "Failed to update product"),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: ProductFormValues) {
    if (!selectedUnit) {
      setUnitError("Unit is required");
      return;
    }
    setUnitError(undefined);
    // When no opening stock, clear price/stock fields to 0
    const stockValues = (!isEditing && !hasOpeningStock)
      ? { gstPercent: 0, purchasePrice: 0, wholesalePrice: 0, retailPrice: 0, currentStock: 0 }
      : {};
    const payload = {
      ...stockValues,
      ...values,
      name:        values.name.trim(),
      barcode:     values.barcode?.trim() || undefined,
      hsnCode:     values.hsnCode?.trim() || undefined,
      unit:        selectedUnit,
      location:    selectedLocation || undefined,
      sellingPrice: values.retailPrice,
      categoryId:  values.categoryId ? Number(values.categoryId) : undefined,
      brandId:     (values.brandId && values.brandId !== NO_BRAND) ? Number(values.brandId) : undefined,
    };
    if (isEditing && product) {
      updateMutation.mutate({ id: product.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  }

  const categoryValue = form.watch("categoryId");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl flex flex-col max-h-[90vh] p-0 gap-0 [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Sticky header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b shrink-0">
          <div className="space-y-1">
            <DialogTitle>{isEditing ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the product details below."
                : "Fill in the details to add a new product to your inventory."}
            </DialogDescription>
          </div>
        </div>

        {isEditing && product?.createdAt && (
          <div className="mx-6 mt-4 flex flex-wrap gap-x-6 gap-y-1 border rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-tight">
              <span className="font-medium text-foreground/70">Created</span>
              <span className="ml-1">{formatDateTime(product.createdAt)}</span>
            </p>
            {product.updatedAt && product.updatedAt !== product.createdAt && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                <span className="font-medium text-foreground/70">Last edited</span>
                <span className="ml-1">{formatDateTime(product.updatedAt)}</span>
              </p>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 px-6 py-4">
            <div className="grid grid-cols-2 gap-4">

              {/* 1. Product Name */}
              <FormField control={form.control} name="name" render={({ field }) => {
                const count = field.value?.length ?? 0;
                return (
                  <FormItem className="col-span-2">
                    <div className="flex items-center justify-between">
                      <FormLabel>Product Name <Req /></FormLabel>
                      <span className={cn("text-xs tabular-nums", count >= 80 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                        {count}/80
                      </span>
                    </div>
                    <FormControl>
                      <Input
                        placeholder="e.g. Basmati Rice 25kg"
                        maxLength={80}
                        {...field}
                        onChange={e => {
                          field.onChange(e);
                          form.trigger("name");
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }} />

              {/* 2. SKU (auto-generated, read-only for new products) */}
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU <Req /></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      readOnly={!isEditing}
                      placeholder={skuLoading ? "Generating…" : "SKU-001"}
                      className={!isEditing ? "bg-muted text-muted-foreground cursor-default" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 3. Barcode */}
              <FormField control={form.control} name="barcode" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Barcode{" "}
                    <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 8901234567890"
                      maxLength={20}
                      {...field}
                      onChange={e => {
                        field.onChange(e.target.value.replace(/\s/g, ""));
                        form.trigger("barcode");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 4. HSN Code */}
              <FormField control={form.control} name="hsnCode" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    HSN Code{" "}
                    <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 1006"
                      maxLength={8}
                      inputMode="numeric"
                      {...field}
                      onChange={e => {
                        field.onChange(e.target.value.replace(/\D/g, ""));
                        form.trigger("hsnCode");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* spacer */}
              <div />

              {/* 5. Brand */}
              <FormField control={form.control} name="brandId" render={() => (
                <FormItem>
                  <FormLabel>Brand <Req /></FormLabel>
                  <SearchableCombobox
                    value={brandComboValue}
                    onValueChange={handleBrandChange}
                    options={brandOptions}
                    placeholder="Select brand"
                    searchPlaceholder="Search brands…"
                    emptyText="No brands found."
                  />
                  <FormMessage />
                </FormItem>
              )} />

              {/* 6. Category (enabled only after Brand chosen) */}
              <FormField control={form.control} name="categoryId" render={() => (
                <FormItem>
                  <FormLabel>Category <Req /></FormLabel>
                  <SearchableCombobox
                    value={categoryValue || undefined}
                    onValueChange={handleCategoryChange}
                    options={categoryOptions}
                    placeholder={
                      !brandComboValue
                        ? "Select brand first"
                        : categoryOptions.length === 0
                        ? "No categories for this brand"
                        : "Select category"
                    }
                    searchPlaceholder="Search categories…"
                    emptyText="No categories found."
                    disabled={!brandComboValue || categoryOptions.length === 0}
                  />
                  <FormMessage />
                </FormItem>
              )} />

              {/* 7. Unit (single-select with search + add new, persisted) */}
              <div className="col-span-2 space-y-2">
                <p className="text-sm font-medium leading-none">Unit <Req /></p>
                <UnitSelect
                  value={selectedUnit}
                  onChange={unit => {
                    setSelectedUnit(unit);
                    if (unit) setUnitError(undefined);
                  }}
                  error={unitError}
                />
              </div>

              {/* 7b. Opening Stock checkbox — Add mode only */}
              {!isEditing && (
                <div className="col-span-2 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
                  <Checkbox
                    id={openingStockCheckId}
                    checked={hasOpeningStock}
                    onCheckedChange={v => {
                      setHasOpeningStock(!!v);
                      if (!v) {
                        form.setValue("gstPercent", 0);
                        form.setValue("purchasePrice", 0);
                        form.setValue("wholesalePrice", 0);
                        form.setValue("retailPrice", 0);
                        form.setValue("currentStock", 0);
                      }
                    }}
                  />
                  <label
                    htmlFor={openingStockCheckId}
                    className="text-sm font-medium leading-none cursor-pointer select-none"
                  >
                    This product has Opening Stock
                  </label>
                  {hasOpeningStock && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      A <em>Stock In</em> movement will be recorded automatically.
                    </span>
                  )}
                </div>
              )}

              {/* Price / stock fields — always shown when editing; shown only when hasOpeningStock when adding */}
              {(isEditing || hasOpeningStock) && (
                <>
                  {/* unit hint helper */}
                  {selectedUnit && (
                    <p className="col-span-2 text-xs text-muted-foreground -mb-1">
                      All prices below are <strong>per {selectedUnit}</strong>, not for the total stock quantity.
                    </p>
                  )}

                  {/* 8. GST % */}
                  <FormField control={form.control} name="gstPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>GST %</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" max="100" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* 9. Purchase Price */}
                  <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Purchase Price{selectedUnit && <span className="text-muted-foreground font-normal text-xs ml-1">/ {selectedUnit}</span>}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* 10. Wholesale Price */}
                  <FormField control={form.control} name="wholesalePrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Wholesale Price{selectedUnit && <span className="text-muted-foreground font-normal text-xs ml-1">/ {selectedUnit}</span>}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* 11. Retail Price */}
                  <FormField control={form.control} name="retailPrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Retail Price{selectedUnit && <span className="text-muted-foreground font-normal text-xs ml-1">/ {selectedUnit}</span>}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* 12. Opening Stock / Current Stock */}
                  <FormField control={form.control} name="currentStock" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isEditing ? "Current Stock" : "Opening Stock"}
                        {selectedUnit && <span className="text-muted-foreground font-normal text-xs ml-1">({selectedUnit})</span>}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min="0" placeholder="0" {...field} disabled={isEditing} />
                      </FormControl>
                      {isEditing && (
                        <p className="text-xs text-muted-foreground">
                          Use Stock Adjustment to change stock.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {/* 13. Low Stock */}
              <FormField control={form.control} name="minStock" render={({ field }) => (
                <FormItem>
                  <FormLabel>Low Stock</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 14. Rack / Location */}
              <div className="space-y-2">
                <p className="text-sm font-medium leading-none">
                  Rack / Location / Floor{" "}
                  <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
                </p>
                <LocationSelect
                  value={selectedLocation}
                  onChange={setSelectedLocation}
                />
              </div>

              {/* 15. Status */}
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

            </div>
            </div>{/* end scrollable body */}

            {/* Sticky footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : isEditing ? "Save Changes" : "Add Product"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
