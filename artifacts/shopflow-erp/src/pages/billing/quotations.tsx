import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useListCustomers, useListProducts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Trash2, Edit } from "lucide-react";

const PAGE_SIZE = 20;

// ── API helpers ──────────────────────────────────────────────────────────────
const QK = ["quotations"] as const;
const today = () => new Date().toISOString().split("T")[0];

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function useQuotations(params: { page: number; search?: string; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(PAGE_SIZE) });
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  return useQuery({ queryKey: [...QK, params], queryFn: () => apiFetch(`/quotations?${qs}`) });
}

function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch("/quotations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation created"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to create"),
  });
}

function useUpdateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation updated"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });
}

function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/quotations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation deleted"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });
}

// ── Form schema ───────────────────────────────────────────────────────────────
const itemSchema = z.object({
  productId: z.coerce.number().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().min(0.01, "Qty required"),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
});

const baseFields = {
  type: z.enum(["gst", "non_gst"]),
  date: z.string().min(1, "Date required"),
  transport: z.coerce.number().min(0).optional(),
  packageCharge: z.coerce.number().min(0).optional(),
  otherCharge: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
};

const existingCustSchema = z.object({
  customerMode: z.literal("existing"),
  customerId: z.coerce.number().min(1, "Customer required"),
  ...baseFields,
});

const newCustSchema = z.object({
  customerMode: z.literal("new"),
  customerName: z.string().min(1, "Name required"),
  customerPhone: z.string().min(1, "Phone required"),
  customerShopName: z.string().optional(),
  customerLandline: z.string().optional(),
  customerEmail: z.string().optional(),
  customerShopType: z.enum(["retail", "wholesale", "both"]),
  customerGstAddress: z.string().optional(),
  customerCity: z.string().optional(),
  customerState: z.string().optional(),
  ...baseFields,
});

const schema = z.discriminatedUnion("customerMode", [existingCustSchema, newCustSchema]);
type FormValues = z.infer<typeof schema>;

const emptyItem = { productId: undefined, productName: "", quantity: 1, unitPrice: 0, discount: 0, gstPercent: 0 };

function defaultValues(): FormValues {
  return {
    customerMode: "existing",
    customerId: 0,
    type: "gst",
    date: today(),
    transport: 0,
    packageCharge: 0,
    otherCharge: 0,
    notes: "",
    status: "draft",
    items: [{ ...emptyItem }],
  } as any;
}

// ── Quotation Form Dialog ─────────────────────────────────────────────────────
function QuotationFormDialog({ open, onOpenChange, quotation }: { open: boolean; onOpenChange: (v: boolean) => void; quotation?: any | null }) {
  const isEditing = !!quotation;
  const form = useForm<FormValues>({ resolver: zodResolver(schema) as any, defaultValues: defaultValues() });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { data: customers } = useListCustomers({ limit: 300 });
  const { data: products } = useListProducts({ limit: 500 });
  const createMutation = useCreateQuotation();
  const updateMutation = useUpdateQuotation();

  const customerMode = form.watch("customerMode" as any);
  const qType = form.watch("type");
  const watchedItems = form.watch("items");

  useEffect(() => {
    if (!open) return;
    if (quotation) {
      form.reset({
        customerMode: quotation.isNewCustomer ? "new" : "existing",
        customerId: quotation.customerId ?? 0,
        customerName: quotation.customerName ?? "",
        customerPhone: quotation.customerPhone ?? "",
        customerShopName: quotation.customerShopName ?? "",
        customerLandline: quotation.customerLandline ?? "",
        customerEmail: quotation.customerEmail ?? "",
        customerShopType: (quotation.customerShopType as any) ?? "retail",
        customerGstAddress: quotation.customerGstAddress ?? "",
        customerCity: quotation.customerCity ?? "",
        customerState: quotation.customerState ?? "",
        type: quotation.type ?? "gst",
        date: quotation.date ?? today(),
        transport: quotation.transport ?? 0,
        packageCharge: quotation.packageCharge ?? 0,
        otherCharge: quotation.otherCharge ?? 0,
        notes: quotation.notes ?? "",
        status: quotation.status ?? "draft",
        items: quotation.items?.length ? quotation.items : [{ ...emptyItem }],
      } as any);
    } else {
      form.reset(defaultValues());
    }
  }, [open, quotation]);

  // Totals
  const transport = Number(form.watch("transport")) || 0;
  const packageCharge = Number(form.watch("packageCharge")) || 0;
  const otherCharge = Number(form.watch("otherCharge")) || 0;
  const itemsSubtotal = watchedItems.reduce((sum, item) => {
    const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100);
    const gst = qType === "gst" ? base * ((Number(item.gstPercent) || 0) / 100) : 0;
    return sum + base + gst;
  }, 0);
  const grandTotal = itemsSubtotal + transport + packageCharge + otherCharge;

  function handleProductChange(index: number, productId: string) {
    const product = products?.data?.find((p) => p.id === Number(productId));
    if (product) {
      form.setValue(`items.${index}.productId` as any, Number(productId));
      form.setValue(`items.${index}.productName` as any, product.name);
      form.setValue(`items.${index}.unitPrice` as any, Number(product.retailPrice) || 0);
      form.setValue(`items.${index}.gstPercent` as any, Number(product.gstPercent) || 0);
    }
  }

  function onSubmit(values: FormValues) {
    const isNew = values.customerMode === "new";
    const payload: any = {
      isNewCustomer: isNew,
      customerId: isNew ? null : (values as any).customerId,
      type: values.type,
      date: values.date,
      transport: values.transport ?? 0,
      packageCharge: values.packageCharge ?? 0,
      otherCharge: values.otherCharge ?? 0,
      notes: values.notes,
      status: values.status ?? "draft",
      items: values.items,
    };
    if (isNew) {
      const v = values as any;
      Object.assign(payload, {
        customerName: v.customerName,
        customerPhone: v.customerPhone,
        customerShopName: v.customerShopName,
        customerLandline: v.customerLandline,
        customerEmail: v.customerEmail,
        customerShopType: v.customerShopType,
        customerGstAddress: v.customerGstAddress,
        customerCity: v.customerCity,
        customerState: v.customerState,
      });
    }

    if (isEditing && quotation) {
      updateMutation.mutate({ id: quotation.id, data: payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Quotation" : "Create Quotation"}</DialogTitle>
          <DialogDescription>Fill in customer details and line items for the quotation.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Customer Mode Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={customerMode === "existing" ? "default" : "outline"}
                size="sm"
                onClick={() => form.setValue("customerMode" as any, "existing")}
              >
                Existing Customer
              </Button>
              <Button
                type="button"
                variant={customerMode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => form.setValue("customerMode" as any, "new")}
              >
                New Customer
              </Button>
            </div>

            {/* Customer Fields */}
            {customerMode === "existing" ? (
              <FormField control={form.control} name={"customerId" as any} render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {customers?.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.shopName ? ` — ${c.shopName}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-3 border rounded-md bg-muted/20">
                <p className="col-span-2 text-sm font-medium text-muted-foreground mb-1">New Customer Details</p>
                <FormField control={form.control} name={"customerName" as any} render={({ field }) => (
                  <FormItem><FormLabel>Name *</FormLabel><FormControl><Input placeholder="Customer name" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerPhone" as any} render={({ field }) => (
                  <FormItem><FormLabel>Phone *</FormLabel><FormControl><Input placeholder="Mobile number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerShopName" as any} render={({ field }) => (
                  <FormItem><FormLabel>Shop Name</FormLabel><FormControl><Input placeholder="Shop / business name" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerLandline" as any} render={({ field }) => (
                  <FormItem><FormLabel>Landline</FormLabel><FormControl><Input placeholder="Landline number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerEmail" as any} render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Email address" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerShopType" as any} render={({ field }) => (
                  <FormItem><FormLabel>Shop Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="both">Both Retail & Wholesale</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name={"customerGstAddress" as any} render={({ field }) => (
                  <FormItem><FormLabel>GST Address</FormLabel><FormControl><Input placeholder="GST billing address" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerCity" as any} render={({ field }) => (
                  <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="City" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name={"customerState" as any} render={({ field }) => (
                  <FormItem><FormLabel>State</FormLabel><FormControl><Input placeholder="State" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}

            <Separator />

            {/* Quotation type + date + status */}
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Quotation Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gst">GST</SelectItem>
                      <SelectItem value="non_gst">Non-GST</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name={"status" as any} render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Items</h4>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ ...emptyItem } as any)}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid gap-2 items-end p-2 rounded-md bg-muted/30" style={{ gridTemplateColumns: qType === "gst" ? "3fr 1fr 1fr 1fr 1fr auto" : "3fr 1fr 1fr 1fr auto" }}>
                  <div>
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    <Select
                      onValueChange={(v) => handleProductChange(index, v)}
                      value={watchedItems[index]?.productId ? String(watchedItems[index].productId) : ""}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select product..." /></SelectTrigger>
                      <SelectContent>
                        {products?.data?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium leading-none mb-1 block">Qty</label>
                    <Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium leading-none mb-1 block">Price (₹)</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.unitPrice`)} />
                  </div>
                  {qType === "gst" && (
                    <div>
                      <label className="text-xs font-medium leading-none mb-1 block">GST%</label>
                      <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.gstPercent`)} />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium leading-none mb-1 block">Disc%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.discount`)} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Charges */}
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name={"transport" as any} render={({ field }) => (
                <FormItem><FormLabel>Transport (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={"packageCharge" as any} render={({ field }) => (
                <FormItem><FormLabel>Packaging (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={"otherCharge" as any} render={({ field }) => (
                <FormItem><FormLabel>Other Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>
              )} />
            </div>

            {/* Grand Total */}
            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t">
              <span className="text-muted-foreground">Items Grand Total</span>
              <span className="text-lg font-bold text-primary">₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <FormField control={form.control} name={"notes" as any} render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional notes..." {...field} /></FormControl></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Quotation"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge helpers ─────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export function Quotations() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);
  const [deletingQuotation, setDeletingQuotation] = useState<any | null>(null);

  const { data, isLoading } = useQuotations({ page, search: search || undefined });
  const deleteMutation = useDeleteQuotation();

  const quotations = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quotations</h2>
          <p className="text-muted-foreground mt-1">Manage price quotations for customers.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => { setEditingQuotation(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Create Quotation
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b bg-muted/20">
          <div className="relative max-w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by quotation no. or customer..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Quotation No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(7).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              )) : quotations.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No quotations found.</TableCell></TableRow>
              ) : quotations.map((q: any) => (
                <TableRow key={q.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium text-primary">{q.quotationNumber}</TableCell>
                  <TableCell>{q.customerName}{q.isNewCustomer && <Badge variant="outline" className="ml-2 text-[10px]">New</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground">{q.date ? format(new Date(q.date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{q.type.replace("_", " ")}</Badge></TableCell>
                  <TableCell><Badge className={`${STATUS_COLORS[q.status] ?? "bg-slate-100 text-slate-700"} hover:opacity-80`} variant="secondary">{q.status}</Badge></TableCell>
                  <TableCell className="text-right font-medium">₹{Number(q.total).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingQuotation(q); setFormOpen(true); }}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingQuotation(q)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {quotations.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + quotations.length} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <QuotationFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingQuotation(null); }}
        quotation={editingQuotation}
      />

      <AlertDialog open={!!deletingQuotation} onOpenChange={(open) => !open && setDeletingQuotation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation "{deletingQuotation?.quotationNumber}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this quotation.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingQuotation && deleteMutation.mutate(deletingQuotation.id, { onSuccess: () => setDeletingQuotation(null) })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
