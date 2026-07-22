import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdjustStock,
  getListProductsQueryKey,
  getListStockMovementsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const schema = z.object({
  type: z.enum(["increase", "decrease", "damage", "lost", "wastage"]).optional()
    .refine(value => value !== undefined, "Movement Type is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  reason: z.string().trim().min(1, "Reason is required"),
});
type FormValues = z.infer<typeof schema>;

const empty = { type: undefined, quantity: 1, reason: "" } as unknown as FormValues;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: { id: number; name: string; currentStock: number } | null;
}

export function StockAdjustDialog({ open, onOpenChange, product }: Props) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(empty);
  }, [open, form]);

  const mutation = useAdjustStock({
    mutation: {
      onSuccess: () => {
        toast.success("Stock adjusted successfully");
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() });
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed to adjust stock"),
    },
  });

  function onSubmit(values: FormValues) {
    if (!product) return;
    mutation.mutate({ id: product.id, data: values });
  }

  const watchedType = form.watch("type");
  const watchedQty = form.watch("quantity") || 0;
  const previewStock = product
    ? watchedType === "increase"
      ? product.currentStock + watchedQty
      : Math.max(0, product.currentStock - watchedQty)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {product ? (
              <>Adjusting stock for <strong>{product.name}</strong>. Current: <strong>{product.currentStock}</strong> units.</>
            ) : "Adjust inventory stock level."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Movement Type <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select movement..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="increase">Increase (Stock In / Purchase)</SelectItem>
                    <SelectItem value="decrease">Decrease (Wrong count or miscount)</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="lost">Lost / Missing</SelectItem>
                    <SelectItem value="wastage">Wastage</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="quantity" render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl><Input type="number" min={1} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {product && (
              <div className="rounded-md bg-muted/50 px-4 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">New stock after adjustment:</span>
                <span className={`font-semibold ${previewStock <= (product as any).minStock ? "text-red-600" : "text-green-700"}`}>
                  {previewStock} units
                </span>
              </div>
            )}

            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="e.g. Physical count correction, Supplier delivery..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Apply Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
