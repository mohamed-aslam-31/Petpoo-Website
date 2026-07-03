import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreatePayment,
  useListCustomers,
  useListSuppliers,
  getListPaymentsQueryKey,
  getGetCustomerLedgerQueryKey,
  getGetCustomerQueryKey,
  getGetSupplierQueryKey,
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

const schema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  method: z.string().min(1, "Method is required"),
  type: z.string().min(1, "Type is required"),
  entityType: z.string().min(1, "Entity type is required"),
  entityId: z.coerce.number().min(1, "Entity is required"),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const makeEmpty = (entityType = "customer", entityId = 0): FormValues => ({
  amount: 0,
  method: "cash",
  type: entityType === "supplier" ? "paid" : "received",
  entityType,
  entityId,
  notes: "",
});

export function PaymentFormDialog({
  open,
  onOpenChange,
  defaultEntityType,
  defaultEntityId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEntityType?: "customer" | "supplier";
  defaultEntityId?: number;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: makeEmpty(defaultEntityType, defaultEntityId),
  });
  const entityType = form.watch("entityType");

  const { data: customers } = useListCustomers({ limit: 200 });
  const { data: suppliers } = useListSuppliers({ limit: 200 });

  useEffect(() => {
    if (open) {
      form.reset(makeEmpty(defaultEntityType, defaultEntityId));
    }
  }, [open, defaultEntityType, defaultEntityId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
    if (form.getValues("entityType") === "customer") {
      const id = form.getValues("entityId");
      if (id) {
        queryClient.invalidateQueries({ queryKey: getGetCustomerLedgerQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(id) });
      }
    } else {
      const id = form.getValues("entityId");
      if (id) {
        queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(id) });
      }
    }
  };

  const createMutation = useCreatePayment({
    mutation: {
      onSuccess: () => {
        toast.success("Payment recorded");
        invalidate();
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });

  const isSaving = createMutation.isPending;

  function onSubmit(values: FormValues) {
    createMutation.mutate({ data: values as any });
  }

  const entities = entityType === "customer" ? customers?.data ?? [] : suppliers?.data ?? [];
  const locked = !!defaultEntityType && !!defaultEntityId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Record an incoming or outgoing payment.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="method" render={({ field }) => (
                <FormItem><FormLabel>Method</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="entityType" render={({ field }) => (
                <FormItem><FormLabel>From / To</FormLabel>
                  <Select
                    onValueChange={(v) => { field.onChange(v); form.setValue("entityId", 0 as any); }}
                    value={field.value}
                    disabled={locked}
                  >
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="entityId" render={({ field }) => (
                <FormItem><FormLabel>{entityType === "customer" ? "Customer" : "Supplier"}</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={field.value ? String(field.value) : ""}
                    disabled={locked}
                  >
                    <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {entities.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Record Payment"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
