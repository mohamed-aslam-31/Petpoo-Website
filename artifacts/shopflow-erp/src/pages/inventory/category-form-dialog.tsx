import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCategory,
  useUpdateCategory,
  useListBrands,
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    brandSelection: z.string().default("no-brand"),
    customBrandName: z.string().optional(),
  })
  .refine(
    (data) =>
      data.brandSelection !== "other" ||
      (data.customBrandName?.trim().length ?? 0) > 0,
    { message: "Enter a brand name", path: ["customBrandName"] }
  );

type FormValues = z.infer<typeof schema>;

interface EditableCategory {
  id: number;
  name: string;
  brandId?: number | null;
  brandName?: string | null;
}

const empty: FormValues = { name: "", brandSelection: "no-brand", customBrandName: "" };

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category?: EditableCategory | null;
}) {
  const isEditing = !!category;
  const queryClient = useQueryClient();
  const { data: brands } = useListBrands();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  const brandSelection = form.watch("brandSelection") ?? "no-brand";

  useEffect(() => {
    if (open) {
      if (category) {
        // Reconstruct form state from category's brandId / brandName
        const selection = category.brandId
          ? String(category.brandId)
          : category.brandName
          ? "other"
          : "no-brand";
        form.reset({
          name: category.name,
          brandSelection: selection,
          customBrandName: category.brandName ?? "",
        });
      } else {
        form.reset(empty);
      }
    }
  }, [open, category, form]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const createMutation = useCreateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category created"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });
  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category updated"); invalidate(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    let brandId: number | null = null;
    let brandName: string | null = null;

    if (
      values.brandSelection &&
      values.brandSelection !== "no-brand" &&
      values.brandSelection !== "other"
    ) {
      brandId = Number(values.brandSelection);
    } else if (values.brandSelection === "other") {
      brandName = values.customBrandName?.trim() || null;
    }

    const payload = { name: values.name, brandId, brandName };
    if (isEditing && category)
      updateMutation.mutate({ id: category.id, data: payload as any });
    else createMutation.mutate({ data: payload as any });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update category details." : "Create a new product category."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Grains & Pulses" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brandSelection"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? "no-brand"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="no-brand">No Brand</SelectItem>
                      {brands?.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other (custom name)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {brandSelection === "other" && (
              <FormField
                control={form.control}
                name="customBrandName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Brand Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter brand name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Category"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
