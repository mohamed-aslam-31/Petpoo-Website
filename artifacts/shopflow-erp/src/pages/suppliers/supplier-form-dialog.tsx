import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSupplier,
  useUpdateSupplier,
  getListSuppliersQueryKey,
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

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface EditableSupplier {
  id: number; name: string; phone: string; email?: string | null;
  address?: string | null; gstNumber?: string | null; notes?: string | null;
}

const empty: FormValues = { name: "", phone: "", email: "", address: "", gstNumber: "", notes: "" };

export function SupplierFormDialog({
  open, onOpenChange, supplier,
}: { open: boolean; onOpenChange: (v: boolean) => void; supplier?: EditableSupplier | null }) {
  const isEditing = !!supplier;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(supplier ? { ...supplier, email: supplier.email ?? "", address: supplier.address ?? "", gstNumber: supplier.gstNumber ?? "", notes: supplier.notes ?? "" } : empty);
  }, [open, supplier, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });

  const createMutation = useCreateSupplier({ mutation: { onSuccess: () => { toast.success("Supplier created"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });
  const updateMutation = useUpdateSupplier({ mutation: { onSuccess: () => { toast.success("Supplier updated"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    if (isEditing && supplier) updateMutation.mutate({ id: supplier.id, data: values });
    else createMutation.mutate({ data: values });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update supplier details." : "Add a new supplier to your records."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Supplier Name</FormLabel><FormControl><Input placeholder="Supplier / company name" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="Phone number" {...field} /></FormControl><FormMessage /></FormItem>
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
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Supplier"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
