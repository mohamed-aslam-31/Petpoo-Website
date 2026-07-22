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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});
type FormValues = z.infer<typeof schema>;

interface EditableBrand { id: number; name: string; createdAt?: string | null; updatedAt?: string | null; }

const empty: FormValues = { name: "" };

export function BrandFormDialog({
  open, onOpenChange, brand,
}: { open: boolean; onOpenChange: (v: boolean) => void; brand?: EditableBrand | null }) {
  const isEditing = !!brand;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(brand ? { name: brand.name } : empty);
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

        {isEditing && brand?.createdAt && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-tight">
              <span className="font-medium text-foreground/70">Created</span>
              <span className="ml-1">{formatDateTime(brand.createdAt)}</span>
            </p>
            {brand.updatedAt && brand.updatedAt !== brand.createdAt && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                <span className="font-medium text-foreground/70">Last edited</span>
                <span className="ml-1">{formatDateTime(brand.updatedAt)}</span>
              </p>
            )}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Enter Brand Name..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
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
