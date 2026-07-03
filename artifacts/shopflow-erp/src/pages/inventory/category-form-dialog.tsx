import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCategory,
  useUpdateCategory,
  getListCategoriesQueryKey,
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

interface EditableCategory { id: number; name: string; description?: string | null }

const empty: FormValues = { name: "", description: "" };

export function CategoryFormDialog({
  open, onOpenChange, category,
}: { open: boolean; onOpenChange: (v: boolean) => void; category?: EditableCategory | null }) {
  const isEditing = !!category;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(category ? { name: category.name, description: category.description ?? "" } : empty);
  }, [open, category, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const createMutation = useCreateCategory({ mutation: { onSuccess: () => { toast.success("Category created"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });
  const updateMutation = useUpdateCategory({ mutation: { onSuccess: () => { toast.success("Category updated"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    if (isEditing && category) updateMutation.mutate({ id: category.id, data: values });
    else createMutation.mutate({ data: values });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update category details." : "Create a new product category."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Grains & Pulses" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Category"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
