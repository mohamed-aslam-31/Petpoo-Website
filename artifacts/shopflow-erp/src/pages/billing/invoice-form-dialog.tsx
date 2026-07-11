import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useUpdateInvoice,
  useListCustomers,
  useListProducts,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useCreditStatus } from "@/hooks/use-credit-status";
import { CreditLimitStatus } from "@/components/credit-limit-status";
import { CreditLimitWarning, type CreditLimitErrorData } from "@/components/credit-limit-warning";
import { isAdmin } from "@/lib/auth";

const itemSchema = z.object({
  productId: z.coerce.number().min(1, "Product required"),
  quantity: z.coerce.number().min(1),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  customerId: z.coerce.number().min(1, "Customer required"),
  type: z.enum(["gst", "non_gst"]),
  status: z.string().optional(),
  discount: z.coerce.number().min(0).optional(),
  transport: z.coerce.number().min(0).optional(),
  packageCharge: z.coerce.number().min(0).optional(),
  otherCharge: z.coerce.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  paidAmount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
});
type FormValues = z.infer<typeof schema>;

const today = new Date().toISOString().split("T")[0];
const emptyItem = { productId: 0, quantity: 1, unitPrice: 0, discount: 0, gstPercent: 0 };
const empty: FormValues = {
  customerId: 0, type: "gst", status: "completed",
  discount: 0, transport: 0, packageCharge: 0, otherCharge: 0,
  paymentMethod: "cash", paidAmount: 0, dueDate: today, notes: "",
  items: [{ ...emptyItem }],
};

interface InvoiceToEdit {
  id: number;
  customerId: number;
  type: string;
  status?: string;
  discount: number;
  transport: number;
  packageCharge?: number;
  otherCharge?: number;
  paymentMethod?: string | null;
  paidAmount: number;
  dueDate?: string | null;
  notes?: string | null;
  items: any[];
  orderId?: number | null;
}

export function InvoiceFormDialog({
  open, onOpenChange, invoice,
}: { open: boolean; onOpenChange: (v: boolean) => void; invoice?: InvoiceToEdit | null }) {
  const isEditing = !!invoice;
  const queryClient = useQueryClient();
  const [adminOverride, setAdminOverride] = useState(false);
  const [creditError, setCreditError] = useState<CreditLimitErrorData | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useListCustomers({ limit: 200 });
  const { data: products } = useListProducts({ limit: 200 });

  // Watch customerId to show credit status
  const watchedCustomerId = form.watch("customerId");
  const { data: creditStatus } = useCreditStatus(
    !isEditing && watchedCustomerId > 0 ? watchedCustomerId : null,
  );

  // Normalise invoice type — strip legacy values
  function normaliseType(t: string): "gst" | "non_gst" {
    if (t === "non_gst") return "non_gst";
    return "gst";
  }

  useEffect(() => {
    if (open) {
      if (invoice) {
        form.reset({
          customerId: invoice.customerId,
          type: normaliseType(invoice.type),
          status: invoice.status ?? "completed",
          discount: invoice.discount,
          transport: invoice.transport,
          packageCharge: invoice.packageCharge ?? 0,
          otherCharge: invoice.otherCharge ?? 0,
          paymentMethod: invoice.paymentMethod ?? "cash",
          paidAmount: invoice.paidAmount,
          dueDate: invoice.dueDate ?? today,
          notes: invoice.notes ?? "",
          items: invoice.items.length > 0
            ? invoice.items.map((it: any) => ({
                productId: it.productId ?? 0,
                quantity: it.quantity ?? 1,
                unitPrice: it.unitPrice ?? 0,
                discount: it.discount ?? 0,
                gstPercent: it.gstPercent ?? 0,
              }))
            : [{ ...emptyItem }],
        });
      } else {
        form.reset({ ...empty, dueDate: new Date().toISOString().split("T")[0] });
      }
    }
    if (!open) {
      setAdminOverride(false);
      setCreditError(null);
    }
  }, [open, invoice, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  // Create invoice with credit limit enforcement + admin override support
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminOverride) headers["X-Admin-Override"] = "true";
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const err: any = new Error(data.message ?? data.error ?? "Failed to create invoice");
        err.data = data;
        throw err;
      }
      return data;
    },
    onSuccess: () => { toast.success("Invoice created"); invalidate(); onOpenChange(false); },
    onError: (e: any) => {
      if (e.data?.error === "CREDIT_LIMIT_EXCEEDED") {
        setCreditError(e.data);
        return;
      }
      toast.error(e.message ?? "Failed to create invoice");
    },
  });

  const updateMutation = useUpdateInvoice({
    mutation: {
      onSuccess: () => { toast.success("Invoice updated"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to update invoice"),
    },
  });

  const invoiceType = form.watch("type");
  const isGst = invoiceType === "gst";

  const watchedItems = form.watch("items");
  const itemsTotal = watchedItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const disc = Number(item.discount) || 0;
    const gst = isGst ? (Number(item.gstPercent) || 0) : 0;
    return sum + qty * price * (1 - disc / 100) * (1 + gst / 100);
  }, 0);
  const transport = Number(form.watch("transport")) || 0;
  const packageCharge = Number(form.watch("packageCharge")) || 0;
  const otherCharge = Number(form.watch("otherCharge")) || 0;
  const discountTotal = Number(form.watch("discount")) || 0;
  const grandTotal = itemsTotal + transport + packageCharge + otherCharge - discountTotal;

  const isOrderLinked = !!invoice?.orderId;

  function onSubmit(values: FormValues) {
    const payload = { ...values, dueDate: values.dueDate || undefined };
    // Zero out GST for non-GST invoices
    if (values.type === "non_gst") {
      payload.items = payload.items.map((item) => ({ ...item, gstPercent: 0 }));
    }
    if (isEditing && invoice) {
      updateMutation.mutate({ id: invoice.id, data: payload as any });
    } else {
      setCreditError(null);
      createMutation.mutate(payload as any);
    }
  }

  function handleProductChange(index: number, productId: string) {
    const product = products?.data?.find((p) => p.id === Number(productId));
    if (product) {
      form.setValue(`items.${index}.productId`, Number(productId));
      form.setValue(`items.${index}.unitPrice`, Number(product.retailPrice) || 0);
      form.setValue(`items.${index}.gstPercent`, Number(product.gstPercent) || 0);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const userIsAdmin = isAdmin();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update invoice details and line items." : "Create a new GST or Non-GST invoice."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem><FormLabel>Customer</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(Number(v)); setCreditError(null); }} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                    <SelectContent>{customers?.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Invoice Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gst">GST Invoice</SelectItem>
                      <SelectItem value="non_gst">Non-GST Invoice</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem><FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paidAmount" render={({ field }) => (
                <FormItem><FormLabel>Paid Amount (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="transport" render={({ field }) => (
                <FormItem><FormLabel>Transport Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="packageCharge" render={({ field }) => (
                <FormItem><FormLabel>Packaging Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="otherCharge" render={({ field }) => (
                <FormItem><FormLabel>Other Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            {isOrderLinked && (
              <p className="text-xs text-muted-foreground -mt-2">This invoice is linked to order {invoice?.orderId ? `#${invoice.orderId}` : ""}. Products are locked; quantity, price, GST% and discount remain editable.</p>
            )}

            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Line Items</h4>
                {!isOrderLinked && (
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ ...emptyItem })}><Plus className="h-3 w-3" /> Add Item</Button>
                )}
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className={`grid gap-2 items-end p-2 rounded-md bg-muted/30 ${isGst ? "grid-cols-12" : "grid-cols-10"}`}>
                  <div className="col-span-4">
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    {isOrderLinked ? (
                      <Input readOnly disabled className="h-8 text-xs bg-muted" value={products?.data?.find((p) => p.id === watchedItems[index]?.productId)?.name ?? ""} />
                    ) : (
                      <Select onValueChange={(v) => handleProductChange(index, v)} value={watchedItems[index]?.productId ? String(watchedItems[index].productId) : ""}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>{products?.data?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Qty</label>
                    <Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Price (₹)</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.unitPrice`)} />
                  </div>
                  {isGst && (
                    <div className="col-span-2">
                      <label className="text-xs font-medium leading-none mb-1 block">GST%</label>
                      <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.gstPercent`)} />
                    </div>
                  )}
                  <div className="col-span-1">
                    <label className="text-xs font-medium leading-none mb-1 block">Disc%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.discount`)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {!isOrderLinked && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </div>
                </div>
              ))}
              {form.formState.errors.items?.root && <p className="text-sm text-destructive">{form.formState.errors.items.root.message}</p>}
            </div>

            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t">
              <span className="text-muted-foreground">Grand Total</span>
              <span className="text-lg font-bold">₹{grandTotal.toFixed(2)}</span>
            </div>

            {/* Credit status preview (only for new invoices with a customer selected) */}
            {!isEditing && creditStatus && creditStatus.creditStatus !== "no_limit" && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Customer Credit</p>
                <CreditLimitStatus data={creditStatus} compact projectedAmount={grandTotal} />
              </div>
            )}

            {/* Credit limit error + admin override (only for new invoices) */}
            {!isEditing && creditError && (
              <CreditLimitWarning
                data={creditError}
                isAdmin={userIsAdmin}
                adminOverride={adminOverride}
                onToggleOverride={setAdminOverride}
              />
            )}

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={isPending || (!isEditing && !!creditError && !adminOverride)}
                variant={!isEditing && creditError && adminOverride ? "destructive" : "default"}
              >
                {isPending
                  ? "Saving..."
                  : !isEditing && creditError && adminOverride
                  ? "Override & Create Invoice"
                  : isEditing
                  ? "Save Changes"
                  : "Create Invoice"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
