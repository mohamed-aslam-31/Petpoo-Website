import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOrder,
  useUpdateOrder,
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
});

const schema = z.object({
  customerId: z.coerce.number().min(1, "Customer required"),
  orderDate: z.string().min(1, "Date required"),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
});
type FormValues = z.infer<typeof schema>;

const emptyItem = { productId: 0, quantity: 1 };
const empty: FormValues = {
  customerId: 0,
  orderDate: new Date().toISOString().slice(0, 10),
  notes: "",
  items: [{ ...emptyItem }],
};

interface OrderToEdit {
  id: number;
  customerId: number;
  orderDate: string;
  notes?: string | null;
  items: any[];
}

export function OrderFormDialog({
  open, onOpenChange, order,
}: { open: boolean; onOpenChange: (v: boolean) => void; order?: OrderToEdit | null }) {
  const isEditing = !!order;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: customers } = useListCustomers({ limit: 200 });
  const { data: products } = useListProducts({ limit: 200 });

  useEffect(() => {
    if (open) {
      if (order) {
        form.reset({
          customerId: order.customerId,
          orderDate: order.orderDate ? order.orderDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          notes: order.notes ?? "",
          items: order.items.length > 0
            ? order.items.map((it: any) => ({ productId: it.productId ?? 0, quantity: it.quantity ?? 1 }))
            : [{ ...emptyItem }],
        });
      } else {
        form.reset(empty);
      }
    }
  }, [open, order, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });

  const createMutation = useCreateOrder({
    mutation: {
      onSuccess: () => { toast.success("Order booked"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to create order"),
    },
  });

  const updateMutation = useUpdateOrder({
    mutation: {
      onSuccess: () => { toast.success("Order updated"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to update order"),
    },
  });

  const watchedItems = form.watch("items");

  function onSubmit(values: FormValues) {
    if (isEditing && order) {
      updateMutation.mutate({ id: order.id, data: values as any });
    } else {
      createMutation.mutate({ data: values as any });
    }
  }

  function handleProductChange(index: number, productId: string) {
    form.setValue(`items.${index}.productId`, Number(productId));
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Order" : "Book Order"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update the booking details and items." : "Book stock for a customer. Payment and billing happen when you complete this order."}</DialogDescription>
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
              <FormField control={form.control} name="orderDate" render={({ field }) => (
                <FormItem><FormLabel>Order Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
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
                  <div className="col-span-8">
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    <Select onValueChange={(v) => handleProductChange(index, v)} value={watchedItems[index]?.productId ? String(watchedItems[index].productId) : ""}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{products?.data?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs font-medium leading-none mb-1 block">Qty</label>
                    <Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              {form.formState.errors.items?.root && <p className="text-sm text-destructive">{form.formState.errors.items.root.message}</p>}
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEditing ? "Save Changes" : "Book Order"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
