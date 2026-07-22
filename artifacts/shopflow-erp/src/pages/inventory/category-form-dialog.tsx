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
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_BRAND = "no-brand";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(60, "Name must be 60 characters or fewer")
    .refine((v) => v.trim().length > 0, "Name cannot be only spaces"),
  brandSelection: z.string().min(1, "Please select a brand"),
});

type FormValues = z.infer<typeof schema>;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

interface EditableCategory {
  id: number;
  name: string;
  brandId?: number | null;
  brandName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const empty: FormValues = { name: "", brandSelection: "" };

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

  // New brand mode: when true, combobox is hidden, input is shown
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const brandSelection = form.watch("brandSelection") ?? NO_BRAND;

  useEffect(() => {
    if (open) {
      setShowNewBrand(false);
      setNewBrandName("");
      setBrandOpen(false);
      if (category) {
        const selection = category.brandId ? String(category.brandId) : NO_BRAND;
        form.reset({ name: category.name, brandSelection: selection });
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
      onError: (e: any) => toast.error(e?.message ?? "Failed to create category"),
    },
  });
  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category updated"); invalidateCategories(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to update category"),
    },
  });

  const isSaving =
    createMutation.isPending || updateMutation.isPending || createBrandMutation.isPending;

  function cancelNewBrand() {
    setShowNewBrand(false);
    setNewBrandName("");
  }

  // Label shown in the combobox trigger
  const brandLabel = (() => {
    if (brandSelection === "") return null;
    if (brandSelection === NO_BRAND) return "No Brand";
    return brands?.find((b) => String(b.id) === brandSelection)?.name ?? "Select brand";
  })();

  async function onSubmit(values: FormValues) {
    let brandId: number | null = null;

    // If new brand mode is active and a name was typed, create the brand first
    if (showNewBrand) {
      const trimmed = newBrandName.trim();
      if (!trimmed) {
        toast.error("Enter a brand name or close the new brand field");
        return;
      }
      try {
        const created = await createBrandMutation.mutateAsync({ data: { name: trimmed } });
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
        brandId = created.id;
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
    else
      createMutation.mutate({ data: payload as any });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update category details." : "Create a new product category."}
          </DialogDescription>
        </DialogHeader>

        {isEditing && category?.createdAt && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-tight">
              <span className="font-medium text-foreground/70">Created</span>
              <span className="ml-1">{formatDateTime(category.createdAt)}</span>
            </p>
            {category.updatedAt && category.updatedAt !== category.createdAt && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                <span className="font-medium text-foreground/70">Last edited</span>
                <span className="ml-1">{formatDateTime(category.updatedAt)}</span>
              </p>
            )}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Category name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Enter Category Name..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Brand field */}
            <FormField
              control={form.control}
              name="brandSelection"
              render={({ field }) => (
                <FormItem>
                  {/* Label row — "Add New Brand" button always visible unless already in new-brand mode */}
                  <div className="flex items-center justify-between">
                    <FormLabel>Brand <span className="text-destructive">*</span></FormLabel>
                    {!showNewBrand && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-primary gap-1"
                        onClick={() => setShowNewBrand(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Add New Brand
                      </Button>
                    )}
                  </div>

                  {showNewBrand ? (
                    /* ── New brand mode: input + X close button, combobox hidden ── */
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="New brand name..."
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelNewBrand();
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={cancelNewBrand}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    /* ── Normal mode: searchable combobox ── */
                    <Popover open={brandOpen} onOpenChange={setBrandOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={brandOpen}
                            className="w-full justify-between font-normal text-left"
                          >
                            <span className={cn("truncate", (brandSelection === NO_BRAND || brandSelection === "") && "text-muted-foreground")}>
                              {brandLabel ?? "Select a brand..."}
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
                                onSelect={() => { field.onChange(NO_BRAND); setBrandOpen(false); }}
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
                                      onSelect={() => { field.onChange(String(b.id)); setBrandOpen(false); }}
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
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}

                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : isEditing
                  ? "Save Changes"
                  : "Add Category"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
