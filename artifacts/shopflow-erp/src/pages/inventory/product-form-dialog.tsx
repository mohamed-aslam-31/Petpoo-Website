import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────
const NO_BRAND = "__no_brand__";
const UNITS_STORAGE_KEY = "shopflow-units";
const DEFAULT_UNITS = [
  "pc", "pcs", "kg", "g", "mg", "l", "ml",
  "box", "dozen", "pair", "set", "roll", "sheet", "bag", "bottle",
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

// ── Unit multi-select component ───────────────────────────────────────────────
function UnitMultiSelect({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (units: string[]) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [availableUnits, setAvailableUnits] = useState<string[]>(getStoredUnits);

  const filtered = availableUnits.filter(u =>
    u.toLowerCase().includes(search.toLowerCase())
  );
  const trimmed = search.trim();
  const canAdd =
    trimmed.length > 0 &&
    !availableUnits.some(u => u.toLowerCase() === trimmed.toLowerCase());

  function toggle(unit: string) {
    onChange(value.includes(unit) ? value.filter(u => u !== unit) : [...value, unit]);
  }

  function addUnit() {
    if (!trimmed) return;
    const updated = [...availableUnits, trimmed];
    setAvailableUnits(updated);
    try { localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
    onChange([...value, trimmed]);
    setSearch("");
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
              "w-full justify-between font-normal text-left min-h-9 h-auto",
              error && "border-destructive"
            )}
          >
            {value.length === 0 ? (
              <span className="text-muted-foreground">Search or select units…</span>
            ) : (
              <div className="flex flex-wrap gap-1 py-0.5">
                {value.map(u => (
                  <Badge key={u} variant="secondary" className="text-xs">{u}</Badge>
                ))}
              </div>
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
              placeholder="Search or add new unit…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {canAdd && (
                <>
                  <CommandGroup>
                    <CommandItem value={`__add__${trimmed}`} onSelect={addUnit} className="text-primary font-medium">
                      <Plus className="mr-2 h-4 w-4" />
                      Add "{trimmed}"
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {filtered.length > 0 ? (
                <CommandGroup heading="Available Units">
                  {filtered.map(unit => (
                    <CommandItem key={unit} value={unit} onSelect={() => toggle(unit)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.includes(unit) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {unit}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : !canAdd ? (
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
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [unitError, setUnitError] = useState<string | undefined>();
  const [skuLoading, setSkuLoading] = useState(false);

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
      setSelectedUnits(units);
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
      setSelectedUnits([]);
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
    form.setValue("brandId", val, { shouldValidate: true });
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
    if (selectedUnits.length === 0) {
      setUnitError("At least one unit is required");
      return;
    }
    setUnitError(undefined);
    const payload = {
      ...values,
      name:        values.name.trim(),
      barcode:     values.barcode?.trim() || undefined,
      hsnCode:     values.hsnCode?.trim() || undefined,
      unit:        selectedUnits.join(","),
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto [&>button:last-child]:hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the product details below."
              : "Fill in the details to add a new product to your inventory."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 min-w-0">
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

              {/* 7. Unit (multi-select with search + add new, persisted) */}
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium leading-none">Unit <Req /></p>
                  {selectedUnits.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedUnits([]); setUnitError("At least one unit is required"); }}
                      className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  )}
                </div>
                <UnitMultiSelect
                  value={selectedUnits}
                  onChange={units => {
                    setSelectedUnits(units);
                    if (units.length > 0) setUnitError(undefined);
                  }}
                  error={unitError}
                />
              </div>

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
                  <FormLabel>Purchase Price</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 10. Wholesale Price */}
              <FormField control={form.control} name="wholesalePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Wholesale Price</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 11. Retail Price */}
              <FormField control={form.control} name="retailPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Retail Price</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 12. Current Stock */}
              <FormField control={form.control} name="currentStock" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Stock</FormLabel>
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

              {/* 13. Minimum Stock */}
              <FormField control={form.control} name="minStock" render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Stock</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* 14. Rack / Location */}
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Rack / Location{" "}
                    <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. A1, Shelf 3" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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

            {/* Footer — save only, no cancel */}
            <div className="flex justify-end pt-2">
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
