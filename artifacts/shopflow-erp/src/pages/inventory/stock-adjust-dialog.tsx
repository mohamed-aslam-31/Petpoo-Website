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

// ─── Movement type definitions ───────────────────────────────────────────────

type PresetKey =
  | "increase_old_stock"
  | "increase_purchase"
  | "decrease_miscount"
  | "decrease_damaged"
  | "decrease_lost"
  | "other";

interface MovementOption {
  key: PresetKey;
  label: string;
  sign: "+" | "-" | null;
  apiType: "increase" | "decrease" | "damage" | "lost" | null;
  autoReason: string | null;
}

const MOVEMENT_OPTIONS: MovementOption[] = [
  { key: "increase_old_stock", label: "Increase (Old Stock)",              sign: "+", apiType: "increase", autoReason: "Old Stock" },
  { key: "increase_purchase",  label: "Increase (Purchase)",               sign: "+", apiType: "increase", autoReason: "Purchase" },
  { key: "decrease_miscount",  label: "Decrease (Wrong Count / Miscount)", sign: "-", apiType: "decrease", autoReason: "Wrong Count / Miscount" },
  { key: "decrease_damaged",   label: "Decrease (Damaged)",                sign: "-", apiType: "damage",   autoReason: "Damaged" },
  { key: "decrease_lost",      label: "Decrease (Lost / Missing)",         sign: "-", apiType: "lost",     autoReason: "Lost / Missing" },
  { key: "other",              label: "Other",                             sign: null, apiType: null,      autoReason: null },
];

// ─── Form schema ─────────────────────────────────────────────────────────────

const schema = z
  .object({
    movementKey: z.string().min(1, "Movement type is required"),
    otherSign: z.enum(["increase", "decrease"]).optional(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    reason: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    if (val.movementKey === "other") {
      if (!val.otherSign) {
        ctx.addIssue({ code: "custom", path: ["otherSign"], message: "Select + or −" });
      }
      if (!val.reason || val.reason.trim().length === 0) {
        ctx.addIssue({ code: "custom", path: ["reason"], message: "Reason is required" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const empty: FormValues = { movementKey: "", otherSign: undefined, quantity: 1, reason: "" };

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: { id: number; name: string; currentStock: number; unit?: string } | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

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
    const opt = MOVEMENT_OPTIONS.find((o) => o.key === values.movementKey)!;
    const apiType = opt.apiType ?? (values.otherSign as "increase" | "decrease");
    const reason = opt.autoReason ?? values.reason;
    mutation.mutate({ id: product.id, data: { type: apiType, quantity: values.quantity, reason } });
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const movementKey  = form.watch("movementKey");
  const otherSign    = form.watch("otherSign");
  const qty          = form.watch("quantity") || 0;
  const unit         = product?.unit ?? "pcs";

  const selectedOpt  = MOVEMENT_OPTIONS.find((o) => o.key === movementKey) ?? null;
  const isOther      = movementKey === "other";
  const isIncrease   = selectedOpt?.sign === "+" || (isOther && otherSign === "increase");

  const previewStock = product
    ? isIncrease
      ? product.currentStock + qty
      : Math.max(0, product.currentStock - qty)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md flex flex-col max-h-[88vh] [&>button:last-of-type]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Fixed header */}
        <DialogHeader className="shrink-0">
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {product ? (
              <>
                Adjusting stock for <strong>{product.name}</strong>. Current:{" "}
                <strong>{product.currentStock}</strong> {unit}.
              </>
            ) : (
              "Adjust inventory stock level."
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1 gap-0">

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 space-y-4 pr-0.5 pb-1">

              {/* ── Movement Type ── */}
              <FormField
                control={form.control}
                name="movementKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Movement Type <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-1.5">
                        {MOVEMENT_OPTIONS.map((opt) => {
                          const isSelected = field.value === opt.key;
                          const isPlus  = opt.sign === "+";
                          const isMinus = opt.sign === "-";
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => {
                                field.onChange(opt.key);
                                if (opt.key !== "other") form.setValue("otherSign", undefined);
                              }}
                              className={[
                                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors shrink-0",
                                isSelected
                                  ? isPlus
                                    ? "border-green-500 bg-green-50 text-green-800"
                                    : isMinus
                                    ? "border-red-500 bg-red-50 text-red-800"
                                    : "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background hover:bg-muted/50 text-foreground",
                              ].join(" ")}
                            >
                              {opt.sign && (
                                <span
                                  className={[
                                    "inline-flex h-5 w-5 items-center justify-center rounded font-bold text-xs shrink-0",
                                    isPlus ? "bg-green-500 text-white" : "bg-red-500 text-white",
                                  ].join(" ")}
                                >
                                  {opt.sign}
                                </span>
                              )}
                              {!opt.sign && (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded font-bold text-xs bg-muted text-muted-foreground shrink-0">
                                  ±
                                </span>
                              )}
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Other: + / − toggle ── */}
              {isOther && (
                <FormField
                  control={form.control}
                  name="otherSign"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Direction <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => field.onChange("increase")}
                            className={[
                              "flex-1 rounded-md border py-2 font-semibold text-sm transition-colors",
                              field.value === "increase"
                                ? "border-green-500 bg-green-500 text-white"
                                : "border-green-500 text-green-700 hover:bg-green-50",
                            ].join(" ")}
                          >
                            + Increase
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange("decrease")}
                            className={[
                              "flex-1 rounded-md border py-2 font-semibold text-sm transition-colors",
                              field.value === "decrease"
                                ? "border-red-500 bg-red-500 text-white"
                                : "border-red-500 text-red-700 hover:bg-red-50",
                            ].join(" ")}
                          >
                            − Decrease
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* ── Quantity ── */}
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem className="ml-3">
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Stock preview ── */}
              {product && movementKey && (
                <div className="rounded-md bg-muted/50 px-4 py-2 text-sm flex justify-between">
                  <span className="text-muted-foreground">New stock after adjustment:</span>
                  <span
                    className={`font-semibold ${
                      previewStock <= (product as any).minStock
                        ? "text-red-600"
                        : "text-green-700"
                    }`}
                  >
                    {previewStock} {unit}
                  </span>
                </div>
              )}

              {/* ── Reason — manual only for Other ── */}
              {isOther && (
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem className="ml-3">
                      <FormLabel>
                        Reason <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Describe the reason for adjustment…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* ── Auto-reason for presets ── */}
              {selectedOpt?.autoReason && (
                <div className="rounded-md bg-muted/40 border border-border px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Reason: </span>
                  {selectedOpt.autoReason}
                </div>
              )}

            </div>
            {/* end scrollable body */}

            {/* Fixed footer */}
            <DialogFooter className="shrink-0 pt-4 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Apply Adjustment"}
              </Button>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
