import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCompleteOrder,
  useListProducts,
  getListOrdersQueryKey,
  getListInvoicesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const itemSchema = z.object({
  productId: z.coerce.number().min(1),
  productName: z.string(),
  quantity: z.coerce.number().min(1, "Qty must be ≥ 1"),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  invoiceType: z.string().min(1),
  status: z.string().min(1),
  paymentMethod: z.string().optional(),
  paidAmount: z.coerce.number().min(0).optional(),
  transportCharge: z.coerce.number().min(0).optional(),
  packageCharge: z.coerce.number().min(0).optional(),
  otherCharge: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});
type FormValues = z.infer<typeof schema>;

interface OrderToComplete {
  id: number;
  orderNumber: string;
  items: { productId: number; productName: string; sku?: string; quantity: number }[];
}

export function OrderCompleteDialog({
  open, onOpenChange, order,
}: { open: boolean; onOpenChange: (v: boolean) => void; order?: OrderToComplete | null }) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoiceType: "gst", status: "completed", paymentMethod: "cash", paidAmount: 0,
      transportCharge: 0, packageCharge: 0, otherCharge: 0, discount: 0, dueDate: "", notes: "", items: [],
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: "items" });

  const { data: products } = useListProducts({ limit: 200 });

  useEffect(() => {
    if (open && order) {
      form.reset({
        invoiceType: "gst", status: "completed", paymentMethod: "cash", paidAmount: 0,
        transportCharge: 0, packageCharge: 0, otherCharge: 0, discount: 0, dueDate: "", notes: "",
        items: order.items.map((it) => {
          const product = products?.data?.find((p) => p.id === it.productId);
          return {
            productId: it.productId,
            productName: it.productName ?? product?.name ?? "Unknown",
            quantity: it.quantity,
            unitPrice: Number(product?.retailPrice) || 0,
            discount: 0,
            gstPercent: Number(product?.gstPercent) || 0,
          };
        }),
      });
    }
  }, [open, order, products, form]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const completeMutation = useCompleteOrder({
    mutation: {
      onSuccess: () => { toast.success("Order completed and invoice generated"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to complete order"),
    },
  });

  const watchedItems = form.watch("items");
  const itemsTotal = watchedItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const disc = Number(item.discount) || 0;
    const gst = Number(item.gstPercent) || 0;
    return sum + qty * price * (1 - disc / 100) * (1 + gst / 100);
  }, 0);
  const transport = Number(form.watch("transportCharge")) || 0;
  const pkg = Number(form.watch("packageCharge")) || 0;
  const other = Number(form.watch("otherCharge")) || 0;
  const discountTotal = Number(form.watch("discount")) || 0;
  const grandTotal = itemsTotal + transport + pkg + other - discountTotal;

  function onSubmit(values: FormValues) {
    if (!order) return;
    const payload = {
      ...values,
      dueDate: values.dueDate || undefined,
      items: values.items.map(({ productId, quantity, unitPrice, discount, gstPercent }) => ({
        productId, quantity, unitPrice, discount, gstPercent,
      })),
    };
    completeMutation.mutate({ id: order.id, data: payload as any });
  }

  const isPending = completeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Order {order?.orderNumber}</DialogTitle>
          <DialogDescription>Generate the invoice for this booking. Product is locked to what was booked; quantity, price, GST% and discount can be adjusted.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="invoiceType" render={({ field }) => (
                <FormItem><FormLabel>Invoice Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gst">GST Invoice</SelectItem>
                      <SelectItem value="non_gst">Non-GST Invoice</SelectItem>
                      <SelectItem value="estimate">Estimate</SelectItem>
                      <SelectItem value="quotation">Quotation</SelectItem>
                      <SelectItem value="credit">Credit Note</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Invoice Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
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
              <FormField control={form.control} name="paidAmount" render={({ field }) => (
                <FormItem><FormLabel>Paid Amount (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="transportCharge" render={({ field }) => (
                <FormItem><FormLabel>Transport (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="packageCharge" render={({ field }) => (
                <FormItem><FormLabel>Packaging (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="otherCharge" render={({ field }) => (
                <FormItem><FormLabel>Other Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem><FormLabel>Due Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <Separator />
            <div className="space-y-2">
              <h4 className="font-medium">Items (product locked to booking)</h4>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/30">
                  <div className="col-span-4">
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    <Input readOnly disabled className="h-8 text-xs bg-muted" value={watchedItems[index]?.productName ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Qty</label>
                    <Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Price (₹)</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.unitPrice`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">GST%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.gstPercent`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Disc%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.discount`)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t">
              <span className="text-muted-foreground">Grand Total</span>
              <span className="text-lg font-bold">₹{grandTotal.toFixed(2)}</span>
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Completing..." : "Complete & Generate Invoice"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
