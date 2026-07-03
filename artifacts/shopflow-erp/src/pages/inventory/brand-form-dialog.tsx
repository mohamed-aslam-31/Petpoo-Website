import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBrand,
  useUpdateBrand,
  getListBrandsQueryKey,
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
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface EditableBrand { id: number; name: string; description?: string | null }

const empty: FormValues = { name: "", description: "" };

export function BrandFormDialog({
  open, onOpenChange, brand,
}: { open: boolean; onOpenChange: (v: boolean) => void; brand?: EditableBrand | null }) {
  const isEditing = !!brand;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(brand ? { name: brand.name, description: brand.description ?? "" } : empty);
  }, [open, brand, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });

  const createMutation = useCreateBrand({ mutation: { onSuccess: () => { toast.success("Brand created"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });
  const updateMutation = useUpdateBrand({ mutation: { onSuccess: () => { toast.success("Brand updated"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    if (isEditing && brand) updateMutation.mutate({ id: brand.id, data: values });
    else createMutation.mutate({ data: values });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Brand" : "Add Brand"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update brand details." : "Create a new product brand."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Tata, Amul..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Brand"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
