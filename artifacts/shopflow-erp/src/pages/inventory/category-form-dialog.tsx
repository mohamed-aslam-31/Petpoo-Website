import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCategory,
  useUpdateCategory,
  useListBrands,
  useCreateBrand,
  getListCategoriesQueryKey,
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_BRAND = "no-brand";
const ADD_NEW = "add-new";

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    brandSelection: z.string().default(NO_BRAND),
    newBrandName: z.string().optional(),
  })
  .refine(
    (data) =>
      data.brandSelection !== ADD_NEW ||
      (data.newBrandName?.trim().length ?? 0) > 0,
    { message: "Enter a brand name", path: ["newBrandName"] }
  );

type FormValues = z.infer<typeof schema>;

interface EditableCategory {
  id: number;
  name: string;
  brandId?: number | null;
  brandName?: string | null;
}

const empty: FormValues = { name: "", brandSelection: NO_BRAND, newBrandName: "" };

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
  const [brandOpen, setBrandOpen] = useState(false);

  const brandSelection = form.watch("brandSelection") ?? NO_BRAND;

  useEffect(() => {
    if (open) {
      if (category) {
        const selection = category.brandId ? String(category.brandId) : NO_BRAND;
        form.reset({ name: category.name, brandSelection: selection, newBrandName: "" });
      } else {
        form.reset(empty);
      }
    }
  }, [open, category, form]);

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const createBrandMutation = useCreateBrand();

  const createMutation = useCreateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category created"); invalidateCategories(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });
  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category updated"); invalidateCategories(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });

  const isSaving =
    createMutation.isPending || updateMutation.isPending || createBrandMutation.isPending;

  // Label shown in the trigger button
  const brandLabel = (() => {
    if (brandSelection === NO_BRAND) return "No Brand";
    if (brandSelection === ADD_NEW) return "+ Add New Brand";
    return brands?.find((b) => String(b.id) === brandSelection)?.name ?? "Select brand";
  })();

  async function onSubmit(values: FormValues) {
    let brandId: number | null = null;

    if (values.brandSelection === ADD_NEW) {
      try {
        const newBrand = await createBrandMutation.mutateAsync({
          data: { name: values.newBrandName!.trim() },
        });
        brandId = newBrand.id;
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to create brand");
        return;
      }
    } else if (values.brandSelection !== NO_BRAND) {
      brandId = Number(values.brandSelection);
    }

    const payload = { name: values.name, brandId, brandName: null };
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

            {/* Brand — searchable combobox with scroll */}
            <FormField
              control={form.control}
              name="brandSelection"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <Popover open={brandOpen} onOpenChange={setBrandOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={brandOpen}
                          className="w-full justify-between font-normal text-left"
                        >
                          <span className={cn("truncate", !field.value || field.value === NO_BRAND ? "text-muted-foreground" : "")}>
                            {brandLabel}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 w-[--radix-popover-trigger-width]"
                      align="start"
                      sideOffset={4}
                    >
                      <Command>
                        <CommandInput placeholder="Search brands..." />
                        <CommandList className="max-h-56 overflow-y-auto">
                          <CommandEmpty>No brands found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="No Brand"
                              onSelect={() => {
                                field.onChange(NO_BRAND);
                                setBrandOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", field.value === NO_BRAND ? "opacity-100" : "opacity-0")} />
                              No Brand
                            </CommandItem>
                          </CommandGroup>

                          {(brands?.length ?? 0) > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup heading="Brands">
                                {brands?.map((b) => (
                                  <CommandItem
                                    key={b.id}
                                    value={b.name}
                                    onSelect={() => {
                                      field.onChange(String(b.id));
                                      setBrandOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === String(b.id) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {b.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}

                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem
                              value="add-new-brand"
                              onSelect={() => {
                                field.onChange(ADD_NEW);
                                setBrandOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", field.value === ADD_NEW ? "opacity-100" : "opacity-0")} />
                              + Add New Brand
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {brandSelection === ADD_NEW && (
              <FormField
                control={form.control}
                name="newBrandName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Brand Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Tata, Amul..." {...field} />
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
