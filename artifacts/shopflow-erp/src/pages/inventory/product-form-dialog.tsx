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
  DialogFooter,
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
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_BRAND = "__no_brand__";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional(),
  hsnCode: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  purchasePrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  wholesalePrice: z.coerce.number().min(0),
  retailPrice: z.coerce.number().min(0),
  gstPercent: z.coerce.number().min(0).max(100),
  unit: z.string().min(1, "Unit is required"),
  currentStock: z.coerce.number().min(0),
  minStock: z.coerce.number().min(0),
  location: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
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
  description?: string | null;
  status?: string;
}

const emptyValues: ProductFormValues = {
  name: "",
  sku: "",
  barcode: "",
  hsnCode: "",
  categoryId: undefined,
  brandId: undefined,
  purchasePrice: 0,
  sellingPrice: 0,
  wholesalePrice: 0,
  retailPrice: 0,
  gstPercent: 0,
  unit: "pcs",
  currentStock: 0,
  minStock: 0,
  location: "",
  description: "",
  status: "active",
};

// Searchable combobox component
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
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal text-left"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
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
              {options.map((opt) => (
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

  // Tracks the raw combobox selection for brand (may be NO_BRAND sentinel)
  const [brandComboValue, setBrandComboValue] = useState<string | undefined>(undefined);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      const initialBrandId = product?.brandId ? String(product.brandId) : undefined;
      setBrandComboValue(initialBrandId);
      form.reset(
        product
          ? {
              ...product,
              categoryId: product.categoryId ? String(product.categoryId) : undefined,
              brandId: initialBrandId,
              barcode: product.barcode ?? "",
              hsnCode: product.hsnCode ?? "",
              location: product.location ?? "",
              description: product.description ?? "",
              status: product.status ?? "active",
            }
          : emptyValues
      );
    }
  }, [open, product, form]);

  // Brand options: real brands + "No Brand" sentinel
  const brandOptions = [
    { value: NO_BRAND, label: "No Brand" },
    ...(brands ?? []).map((b) => ({ value: String(b.id), label: b.name })),
  ];

  // Category options filtered by selected brand
  const categoryOptions = (() => {
    if (!brandComboValue) {
      // No brand chosen yet — show all categories
      return (categories ?? []).map((c) => ({ value: String(c.id), label: c.name }));
    }
    if (brandComboValue === NO_BRAND) {
      // Show only categories with no brand
      return (categories ?? [])
        .filter((c) => c.brandId == null)
        .map((c) => ({ value: String(c.id), label: c.name }));
    }
    // Show only categories belonging to the selected brand
    const numericBrandId = Number(brandComboValue);
    return (categories ?? [])
      .filter((c) => c.brandId === numericBrandId)
      .map((c) => ({ value: String(c.id), label: c.name }));
  })();

  function handleBrandChange(val: string | undefined) {
    setBrandComboValue(val);
    // Actual form value: sentinel maps to undefined, real ID stays as string
    form.setValue("brandId", val === NO_BRAND ? undefined : val);
    // Reset category when brand changes
    form.setValue("categoryId", undefined);
  }

  function handleCategoryChange(val: string | undefined) {
    form.setValue("categoryId", val);
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
    const payload = {
      ...values,
      categoryId: values.categoryId ? Number(values.categoryId) : undefined,
      brandId: values.brandId ? Number(values.brandId) : undefined,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the product details below."
              : "Fill in the details to add a new product to your inventory."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Basmati Rice 25kg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="SKU-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barcode</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hsnCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HSN Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="pcs, kg, box..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Brand — searchable combobox */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Brand</label>
                <SearchableCombobox
                  value={brandComboValue}
                  onValueChange={handleBrandChange}
                  options={brandOptions}
                  placeholder="Select brand"
                  searchPlaceholder="Search brands..."
                  emptyText="No brands found."
                />
              </div>

              {/* Category — searchable combobox, filtered by brand */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Category</label>
                <SearchableCombobox
                  value={categoryValue}
                  onValueChange={handleCategoryChange}
                  options={categoryOptions}
                  placeholder={
                    brandComboValue && categoryOptions.length === 0
                      ? "No categories for this brand"
                      : "Select category"
                  }
                  searchPlaceholder="Search categories..."
                  emptyText="No categories found."
                  disabled={!!brandComboValue && categoryOptions.length === 0}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
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
                )}
              />

              <FormField
                control={form.control}
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sellingPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="wholesalePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wholesale Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="retailPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retail Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gstPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currentStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Stock</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isEditing} />
                    </FormControl>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">
                        Use Stock Adjustment to change stock.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Stock</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rack / Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
