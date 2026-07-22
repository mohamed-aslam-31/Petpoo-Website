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
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_BRAND = "no-brand";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  brandSelection: z.string().default(NO_BRAND),
});

type FormValues = z.infer<typeof schema>;

interface EditableCategory {
  id: number;
  name: string;
  brandId?: number | null;
  brandName?: string | null;
}

const empty: FormValues = { name: "", brandSelection: NO_BRAND };

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

  // "Add new brand" inline state — separate from the dropdown
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSaving, setNewBrandSaving] = useState(false);

  const brandSelection = form.watch("brandSelection") ?? NO_BRAND;

  useEffect(() => {
    if (open) {
      setShowNewBrand(false);
      setNewBrandName("");
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
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });
  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => { toast.success("Category updated"); invalidateCategories(); onOpenChange(false); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Save the new brand and auto-select it
  async function handleSaveNewBrand() {
    const trimmed = newBrandName.trim();
    if (!trimmed) { toast.error("Enter a brand name"); return; }
    setNewBrandSaving(true);
    try {
      const created = await createBrandMutation.mutateAsync({ data: { name: trimmed } });
      queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
      form.setValue("brandSelection", String(created.id));
      setShowNewBrand(false);
      setNewBrandName("");
      toast.success(`Brand "${created.name}" created`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create brand");
    } finally {
      setNewBrandSaving(false);
    }
  }

  // Label shown in trigger
  const brandLabel = (() => {
    if (brandSelection === NO_BRAND) return "No Brand";
    return brands?.find((b) => String(b.id) === brandSelection)?.name ?? "Select brand";
  })();

  async function onSubmit(values: FormValues) {
    const brandId = values.brandSelection !== NO_BRAND ? Number(values.brandSelection) : null;
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

            {/* Brand field with "Add New Brand" button in the label row */}
            <FormField
              control={form.control}
              name="brandSelection"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Brand</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-primary gap-1"
                      onClick={() => { setShowNewBrand((v) => !v); setNewBrandName(""); }}
                    >
                      <Plus className="h-3 w-3" />
                      Add New Brand
                    </Button>
                  </div>

                  {/* Inline new-brand input — shown when toggle is active */}
                  {showNewBrand && (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="New brand name..."
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleSaveNewBrand(); }
                          if (e.key === "Escape") { setShowNewBrand(false); setNewBrandName(""); }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={newBrandSaving || !newBrandName.trim()}
                        onClick={handleSaveNewBrand}
                      >
                        {newBrandSaving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}

                  {/* Searchable brand combobox */}
                  <Popover open={brandOpen} onOpenChange={setBrandOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={brandOpen}
                          className="w-full justify-between font-normal text-left"
                        >
                          <span className={cn("truncate", brandSelection === NO_BRAND && "text-muted-foreground")}>
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
                  <FormMessage />
                </FormItem>
              )}
            />

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
