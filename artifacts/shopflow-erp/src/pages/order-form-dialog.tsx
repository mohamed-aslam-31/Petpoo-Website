import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOrder,
  useListCustomers,
  useListProducts,
  getListOrdersQueryKey,
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

const itemSchema = z.object({
  productId: z.coerce.number().min(1, "Product required"),
  quantity: z.coerce.number().min(1, "Qty must be ≥ 1"),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  customerId: z.coerce.number().min(1, "Customer required"),
  type: z.string().min(1),
  discount: z.coerce.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  paidAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
});
type FormValues = z.infer<typeof schema>;

const emptyItem = { productId: 0, quantity: 1, unitPrice: 0, discount: 0, gstPercent: 0 };
const empty: FormValues = { customerId: 0, type: "retail", discount: 0, paymentMethod: "cash", paidAmount: 0, notes: "", items: [{ ...emptyItem }] };

export function OrderFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useListCustomers({ limit: 200 });
  const { data: products } = useListProducts({ limit: 200 });

  useEffect(() => { if (open) form.reset(empty); }, [open, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });

  const createMutation = useCreateOrder({
    mutation: {
      onSuccess: () => { toast.success("Order created"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to create order"),
    },
  });

  const watchedItems = form.watch("items");
  const subtotal = watchedItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const disc = Number(item.discount) || 0;
    const gst = Number(item.gstPercent) || 0;
    const lineTotal = qty * price * (1 - disc / 100) * (1 + gst / 100);
    return sum + lineTotal;
  }, 0);

  function onSubmit(values: FormValues) {
    createMutation.mutate({ data: values as any });
  }

  function handleProductChange(index: number, productId: string) {
    const product = products?.data?.find((p) => p.id === Number(productId));
    if (product) {
      form.setValue(`items.${index}.productId`, Number(productId));
      form.setValue(`items.${index}.unitPrice`, Number(product.retailPrice) || 0);
      form.setValue(`items.${index}.gstPercent`, Number(product.gstPercent) || 0);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Order</DialogTitle>
          <DialogDescription>Create a new retail or wholesale order.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem><FormLabel>Customer</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                    <SelectContent>{customers?.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="retail">Retail</SelectItem><SelectItem value="wholesale">Wholesale</SelectItem></SelectContent>
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
            </div>

            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Items</h4>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ ...emptyItem })}><Plus className="h-3 w-3" /> Add Item</Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/30">
                  <div className="col-span-4">
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    <Select onValueChange={(v) => handleProductChange(index, v)} value={watchedItems[index]?.productId ? String(watchedItems[index].productId) : ""}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{products?.data?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Qty</label>
                    <Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">Price</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.unitPrice`)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium leading-none mb-1 block">GST%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.gstPercent`)} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs font-medium leading-none mb-1 block">Disc%</label>
                    <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.discount`)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              {form.formState.errors.items?.root && <p className="text-sm text-destructive">{form.formState.errors.items.root.message}</p>}
            </div>

            <div className="flex justify-between items-center text-sm font-medium pt-2">
              <span className="text-muted-foreground">Estimated Total</span>
              <span className="text-lg font-bold">₹{subtotal.toFixed(2)}</span>
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Order"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
