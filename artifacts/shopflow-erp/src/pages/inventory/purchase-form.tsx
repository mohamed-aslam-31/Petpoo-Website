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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Trash2, Plus, ArrowLeft, Printer, Save } from "lucide-react";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────────
// Form schema
// ────────────────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  productId: z.coerce.number().min(1, "Product required"),
  brandId: z.coerce.number().nullable().optional(),
  brandName: z.string().nullable().optional(),
  categoryId: z.coerce.number().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  sku: z.string().optional(),
  currentStock: z.coerce.number().optional(),
  quantity: z.coerce.number().int().min(1, "Qty must be ≥ 1"),
  unit: z.string().optional(),
  purchasePrice: z.coerce.number().min(0, "Price required"),
  gstPercent: z.coerce.number().min(0).optional(),
  lineTotal: z.coerce.number().optional(),
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
  brandId: null,
  brandName: null,
  categoryId: null,
  categoryName: null,
  sku: "",
  currentStock: 0,
  quantity: 1,
  unit: "",
  purchasePrice: 0,
  gstPercent: 0,
  lineTotal: 0,
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
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);

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
  const watchedCharges = form.watch(["packingCharges", "transportCharges", "loadingCharges", "otherCharges", "discount"]);

  // ── Totals ────────────────────────────────────────────────────────────────────

  const subtotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    return acc + qty * price;
  }, 0);

  const gstTotal = watchedItems.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.purchasePrice) || 0;
    const gst = Number(item.gstPercent) || 0;
    return acc + qty * price * (gst / 100);
  }, 0);

  const packingCharges = Number(watchedCharges[0]) || 0;
  const transportCharges = Number(watchedCharges[1]) || 0;
  const loadingCharges = Number(watchedCharges[2]) || 0;
  const otherCharges = Number(watchedCharges[3]) || 0;
  const discount = Number(watchedCharges[4]) || 0;
  const additionalCharges = packingCharges + transportCharges + loadingCharges + otherCharges;
  const grandTotal = subtotal + gstTotal + additionalCharges - discount;

  // ── Mutation ──────────────────────────────────────────────────────────────────

  const createMutation = useCreatePurchase({
    mutation: {
      onSuccess: () => {
        toast.success("Purchase saved — stock updated");
        queryClient.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
        setLocation("/inventory/purchases");
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to save purchase"),
    },
  });

  const createAndPrintMutation = useCreatePurchase({
    mutation: {
      onSuccess: (data) => {
        toast.success("Purchase saved — stock updated");
        queryClient.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
        // Navigate to purchase detail for printing
        setLocation(`/inventory/purchases/${data.id}`);
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

  // ── Per-row cascading logic ───────────────────────────────────────────────────

  const handleProductChange = useCallback(
    (index: number, productId: string) => {
      const pid = Number(productId);
      const product = allProducts.find((p: { id: number }) => p.id === pid);
      if (!product) return;

      const brand = allBrands.find((b: { id: number }) => b.id === product.brandId);
      const category = allCategories.find((c: { id: number }) => c.id === product.categoryId);

      form.setValue(`items.${index}.productId`, pid);
      form.setValue(`items.${index}.sku`, product.sku ?? "");
      form.setValue(`items.${index}.currentStock`, product.currentStock ?? 0);
      form.setValue(`items.${index}.unit`, product.unit ?? "");
      form.setValue(`items.${index}.purchasePrice`, parseFloat(String(product.purchasePrice ?? 0)));
      form.setValue(`items.${index}.gstPercent`, parseFloat(String(product.gstPercent ?? 0)));
      form.setValue(`items.${index}.brandId`, product.brandId ?? null);
      form.setValue(`items.${index}.brandName`, brand?.name ?? null);
      form.setValue(`items.${index}.categoryId`, product.categoryId ?? null);
      form.setValue(`items.${index}.categoryName`, category?.name ?? null);
    },
    [allProducts, allBrands, allCategories, form]
  );

  const handleBrandChange = useCallback(
    (index: number, brandId: string) => {
      const bid = Number(brandId) || null;
      const brand = allBrands.find((b: { id: number }) => b.id === bid);
      form.setValue(`items.${index}.brandId`, bid);
      form.setValue(`items.${index}.brandName`, brand?.name ?? null);
      // Clear product/category when brand changes
      form.setValue(`items.${index}.productId`, 0);
      form.setValue(`items.${index}.categoryId`, null);
      form.setValue(`items.${index}.categoryName`, null);
      form.setValue(`items.${index}.sku`, "");
      form.setValue(`items.${index}.currentStock`, 0);
      form.setValue(`items.${index}.unit`, "");
      form.setValue(`items.${index}.purchasePrice`, 0);
      form.setValue(`items.${index}.gstPercent`, 0);
    },
    [allBrands, form]
  );

  const handleCategoryChange = useCallback(
    (index: number, categoryId: string) => {
      const cid = Number(categoryId) || null;
      const category = allCategories.find((c: { id: number }) => c.id === cid);
      form.setValue(`items.${index}.categoryId`, cid);
      form.setValue(`items.${index}.categoryName`, category?.name ?? null);
      // Auto-select brand from category
      if (category?.brandId) {
        const brand = allBrands.find((b: { id: number }) => b.id === category.brandId);
        form.setValue(`items.${index}.brandId`, category.brandId);
        form.setValue(`items.${index}.brandName`, brand?.name ?? null);
      }
      // Clear product
      form.setValue(`items.${index}.productId`, 0);
      form.setValue(`items.${index}.sku`, "");
      form.setValue(`items.${index}.currentStock`, 0);
      form.setValue(`items.${index}.unit`, "");
      form.setValue(`items.${index}.purchasePrice`, 0);
      form.setValue(`items.${index}.gstPercent`, 0);
    },
    [allCategories, allBrands, form]
  );

  const isSaving = createMutation.isPending || createAndPrintMutation.isPending;

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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Supplier */}
              <div className="space-y-2">
                <Label htmlFor="supplier-select">Supplier *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <FormField
                      control={form.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <Select
                            onValueChange={(v) => field.onChange(Number(v))}
                            value={field.value ? String(field.value) : ""}
                          >
                            <FormControl>
                              <SelectTrigger id="supplier-select">
                                <SelectValue placeholder="Select supplier…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {suppliers.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                    className="shrink-0 text-xs px-3"
                  >
                    + New
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional remarks…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* ── Items table ────────────────────────────────────────────────────── */}
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-base">Purchase Items</h2>
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

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[120px]">Brand</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[120px]">Category</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[160px]">Product *</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[90px]">SKU</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[80px]">In Stock</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[80px]">Qty *</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[70px]">Unit</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[110px]">Price/Unit *</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[70px]">GST %</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[110px]">Total</th>
                    <th className="w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((field, index) => {
                    const item = watchedItems[index];
                    const brandId = item?.brandId;
                    const categoryId = item?.categoryId;

                    // Filtered dropdowns
                    const filteredCategories = brandId
                      ? allCategories.filter((c) => c.brandId === Number(brandId))
                      : allCategories;

                    const filteredProducts = allProducts.filter((p) => {
                      const matchesBrand = brandId ? p.brandId === Number(brandId) : true;
                      const matchesCat = categoryId ? p.categoryId === Number(categoryId) : true;
                      return matchesBrand && matchesCat;
                    });

                    const lineTotal =
                      (Number(item?.quantity) || 0) * (Number(item?.purchasePrice) || 0);
                    const gstAmt = lineTotal * ((Number(item?.gstPercent) || 0) / 100);

                    return (
                      <tr key={field.id} className="hover:bg-muted/20">
                        {/* Brand */}
                        <td className="px-2 py-2">
                          <Select
                            value={item?.brandId ? String(item.brandId) : ""}
                            onValueChange={(v) => handleBrandChange(index, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Any…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Any</SelectItem>
                              {allBrands.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Category */}
                        <td className="px-2 py-2">
                          <Select
                            value={item?.categoryId ? String(item.categoryId) : ""}
                            onValueChange={(v) => handleCategoryChange(index, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Any…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Any</SelectItem>
                              {filteredCategories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Product */}
                        <td className="px-2 py-2">
                          <Select
                            value={item?.productId ? String(item.productId) : ""}
                            onValueChange={(v) => handleProductChange(index, v)}
                          >
                            <SelectTrigger className={cn("h-8 text-xs", !item?.productId && "border-destructive/50")}>
                              <SelectValue placeholder="Select product…" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredProducts.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* SKU */}
                        <td className="px-2 py-2">
                          <Input
                            value={item?.sku ?? ""}
                            readOnly
                            className="h-8 text-xs bg-muted/40 text-muted-foreground"
                            tabIndex={-1}
                          />
                        </td>

                        {/* Current Stock */}
                        <td className="px-2 py-2">
                          <Input
                            value={item?.currentStock ?? 0}
                            readOnly
                            className="h-8 text-xs bg-muted/40 text-muted-foreground text-right"
                            tabIndex={-1}
                          />
                        </td>

                        {/* Qty */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={1}
                            className="h-8 text-xs text-right"
                            {...form.register(`items.${index}.quantity`)}
                          />
                        </td>

                        {/* Unit */}
                        <td className="px-2 py-2">
                          <Input
                            value={item?.unit ?? ""}
                            readOnly
                            className="h-8 text-xs bg-muted/40 text-muted-foreground"
                            tabIndex={-1}
                          />
                        </td>

                        {/* Purchase Price */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-xs text-right"
                            {...form.register(`items.${index}.purchasePrice`)}
                          />
                        </td>

                        {/* GST % */}
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-xs text-right"
                            {...form.register(`items.${index}.gstPercent`)}
                          />
                        </td>

                        {/* Total */}
                        <td className="px-2 py-2 text-right">
                          <div className="text-xs font-medium pr-1">
                            {fmt(lineTotal + gstAmt)}
                          </div>
                          <div className="text-xs text-muted-foreground pr-1">
                            {fmt(lineTotal)} + {fmt(gstAmt)} GST
                          </div>
                        </td>

                        {/* Remove */}
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => remove(index)}
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
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" {...form.register("packingCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Transport Charges</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" {...form.register("transportCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Loading / Unloading</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" {...form.register("loadingCharges")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Other Charges</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" {...form.register("otherCharges")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Discount</Label>
                <Input type="number" min={0} step="0.01" placeholder="0.00" className="text-right" {...form.register("discount")} />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg border bg-card shadow-sm p-6 space-y-3">
              <h2 className="font-semibold text-base">Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST Total</span>
                  <span className="font-medium">{fmt(gstTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Additional Charges</span>
                  <span className="font-medium">{fmt(additionalCharges)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>- {fmt(discount)}</span>
                  </div>
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
          <div className="flex items-center justify-end gap-3 pb-6">
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
              onClick={form.handleSubmit(onSaveAndPrint)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save & Print"}
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={form.handleSubmit(onSave)}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save Purchase"}
            </Button>
          </div>
        </form>
      </Form>

      {/* Add supplier dialog */}
      <AddSupplierDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        onCreated={(id) => form.setValue("supplierId", id)}
      />
    </div>
  );
}
