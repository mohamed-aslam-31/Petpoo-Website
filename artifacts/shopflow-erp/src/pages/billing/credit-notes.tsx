import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useListCustomers, useListInvoices } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Trash2, Edit, Info } from "lucide-react";

const PAGE_SIZE = 20;
const QK = ["credit-notes"] as const;

// ── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function useCreditNotes(params: { page: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(PAGE_SIZE) });
  if (params.search) qs.set("search", params.search);
  return useQuery({ queryKey: [...QK, params], queryFn: () => apiFetch(`/credit-notes?${qs}`) });
}

function useCreateCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch("/credit-notes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Credit note created"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to create"),
  });
}

function useDeleteCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/credit-notes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Credit note deleted"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });
}

// ── Form schema ───────────────────────────────────────────────────────────────
const returnItemSchema = z.object({
  productId: z.coerce.number(),
  productName: z.string().optional(),
  quantity: z.coerce.number().min(0.01, "Qty required"),
  unitPrice: z.coerce.number().min(0),
  amount: z.coerce.number().min(0),
});

const schema = z.object({
  invoiceId: z.coerce.number().optional().nullable(),
  customerId: z.coerce.number().min(1, "Customer required"),
  type: z.enum(["return", "damaged", "wrong_amount"]),
  amount: z.coerce.number().min(0),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(returnItemSchema).optional(),
});

type FormValues = z.infer<typeof schema>;

const TYPE_INFO = {
  return: { label: "Return Products", desc: "Customer returns products — stock increases and outstanding reduces.", color: "bg-blue-50 border-blue-200 text-blue-800" },
  damaged: { label: "Damaged Products", desc: "Products are damaged. Customer keeps goods — outstanding reduces (revenue loss).", color: "bg-amber-50 border-amber-200 text-amber-800" },
  wrong_amount: { label: "Wrong Invoice Amount", desc: "Invoice was overcharged — difference is credited and outstanding reduces.", color: "bg-purple-50 border-purple-200 text-purple-800" },
};

// ── Credit Note Form Dialog ───────────────────────────────────────────────────
function CreditNoteFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: { invoiceId: null, customerId: 0, type: "return", amount: 0, reason: "", notes: "", items: [] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" as any });
  const { data: customers } = useListCustomers({ limit: 300 });
  const { data: invoices } = useListInvoices({ limit: 200 });
  const createMutation = useCreateCreditNote();

  const creditType = form.watch("type");
  const invoiceId = form.watch("invoiceId");
  const watchedItems = form.watch("items" as any) as any[];

  // When invoice selected, auto-fill customer
  useEffect(() => {
    if (!invoiceId) return;
    const inv = invoices?.data?.find((i: any) => i.id === Number(invoiceId));
    if (inv) {
      form.setValue("customerId" as any, inv.customerId);
      // Pre-populate return items from invoice
      if (creditType === "return" && inv.items?.length) {
        form.setValue("items" as any, inv.items.map((it: any) => ({
          productId: it.productId,
          productName: it.productName ?? "",
          quantity: 0,
          unitPrice: it.unitPrice ?? 0,
          amount: 0,
        })));
      }
    }
  }, [invoiceId, creditType]);

  // Auto-calculate amount for return type
  useEffect(() => {
    if (creditType === "return" && watchedItems?.length) {
      const total = watchedItems.reduce((sum: number, item: any) => {
        const amt = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        return sum + amt;
      }, 0);
      form.setValue("amount" as any, Math.round(total * 100) / 100);
      // Update individual amounts
      watchedItems.forEach((item: any, i: number) => {
        const amt = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        form.setValue(`items.${i}.amount` as any, Math.round(amt * 100) / 100);
      });
    }
  }, [JSON.stringify(watchedItems?.map((i: any) => ({ q: i.quantity, p: i.unitPrice })))]);

  useEffect(() => {
    if (!open) form.reset({ invoiceId: null, customerId: 0, type: "return", amount: 0, reason: "", notes: "", items: [] });
  }, [open]);

  function onSubmit(values: FormValues) {
    const payload: any = {
      customerId: values.customerId,
      type: values.type,
      amount: values.amount,
      reason: values.reason,
      notes: values.notes,
      items: values.type === "return" ? (values.items ?? []) : [],
    };
    if (values.invoiceId) {
      payload.invoiceId = values.invoiceId;
      const inv = invoices?.data?.find((i: any) => i.id === Number(values.invoiceId));
      if (inv) payload.invoiceNumber = inv.invoiceNumber;
    }
    createMutation.mutate(payload, { onSuccess: () => onOpenChange(false) });
  }

  const typeInfo = TYPE_INFO[creditType];
  const selectedInvoice = invoiceId ? invoices?.data?.find((i: any) => i.id === Number(invoiceId)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Credit Note</DialogTitle>
          <DialogDescription>Issue a credit note for returns, damaged goods, or invoice corrections.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Credit Type */}
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Credit Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="return">Return Products</SelectItem>
                    <SelectItem value="damaged">Damaged Products</SelectItem>
                    <SelectItem value="wrong_amount">Wrong Invoice Amount</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Type info banner */}
            <div className={`flex gap-2 p-3 rounded-md border text-sm ${typeInfo.color}`}>
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{typeInfo.desc}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Linked Invoice (optional) */}
              <FormField control={form.control} name="invoiceId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Linked Invoice <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                    value={field.value ? String(field.value) : "none"}
                  >
                    <FormControl><SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">No linked invoice</SelectItem>
                      {invoices?.data?.map((inv: any) => (
                        <SelectItem key={inv.id} value={String(inv.id)}>
                          {inv.invoiceNumber} — {inv.customerName} (₹{Number(inv.total).toLocaleString("en-IN")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Customer */}
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                    <FormControl>
                      <SelectTrigger disabled={!!invoiceId}>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers?.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Invoice summary if linked */}
            {selectedInvoice && (
              <div className="p-3 bg-muted/30 border rounded-md text-sm">
                <p className="font-medium mb-1">Invoice: {selectedInvoice.invoiceNumber}</p>
                <p className="text-muted-foreground">Total: ₹{Number(selectedInvoice.total).toLocaleString("en-IN")} · Status: {selectedInvoice.status}</p>
              </div>
            )}

            <Separator />

            {/* Return items table — only for "return" type */}
            {creditType === "return" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Items to Return</h4>
                  {!invoiceId && (
                    <Button type="button" variant="outline" size="sm" className="gap-1"
                      onClick={() => append({ productId: 0, productName: "", quantity: 1, unitPrice: 0, amount: 0 } as any)}>
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                  )}
                </div>
                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {invoiceId ? "Invoice items will appear here." : "Add items being returned."}
                  </p>
                )}
                {fields.map((field, index) => {
                  const item = watchedItems?.[index] as any;
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md bg-muted/30">
                      <div className="col-span-4">
                        <label className="text-xs font-medium mb-1 block">Product</label>
                        <Input readOnly={!!invoiceId} disabled={!!invoiceId} className="h-8 text-xs"
                          value={item?.productName || ""}
                          onChange={(e) => form.setValue(`items.${index}.productName` as any, e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium mb-1 block">Return Qty</label>
                        <Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.quantity` as any)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium mb-1 block">Unit Price</label>
                        <Input type="number" step="0.01" className="h-8 text-xs" readOnly={!!invoiceId}
                          {...form.register(`items.${index}.unitPrice` as any)} />
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs font-medium mb-1 block">Amount (₹)</label>
                        <Input type="number" step="0.01" className="h-8 text-xs bg-muted" readOnly
                          value={((Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0)).toFixed(2)}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {!invoiceId && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Amount */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Credit Amount (₹)
                    {creditType === "return" && <span className="text-xs text-muted-foreground ml-1">(auto-calculated)</span>}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" readOnly={creditType === "return"} className={creditType === "return" ? "bg-muted" : ""} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem><FormLabel>Reason</FormLabel><FormControl><Input placeholder="Reason for credit note..." {...field} /></FormControl></FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Additional notes..." {...field} /></FormControl></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Credit Note"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Status + type helpers ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  applied: "bg-green-100 text-green-700",
};

const TYPE_LABELS: Record<string, string> = {
  return: "Return",
  damaged: "Damaged",
  wrong_amount: "Wrong Amount",
};

const TYPE_COLORS: Record<string, string> = {
  return: "bg-blue-100 text-blue-700",
  damaged: "bg-amber-100 text-amber-700",
  wrong_amount: "bg-purple-100 text-purple-700",
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export function CreditNotes() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deletingCn, setDeletingCn] = useState<any | null>(null);

  const { data, isLoading } = useCreditNotes({ page, search: search || undefined });
  const deleteMutation = useDeleteCreditNote();

  const creditNotes = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Credit Notes</h2>
          <p className="text-muted-foreground mt-1">Manage returns, damaged goods, and invoice corrections.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Create Credit Note
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(TYPE_INFO).map(([key, info]) => (
          <div key={key} className={`p-4 rounded-md border ${info.color}`}>
            <p className="font-semibold text-sm">{info.label}</p>
            <p className="text-xs mt-1 opacity-80">{info.desc}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b bg-muted/20">
          <div className="relative max-w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search credit notes..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Credit Note No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Linked Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              )) : creditNotes.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No credit notes found.</TableCell></TableRow>
              ) : creditNotes.map((cn: any) => (
                <TableRow key={cn.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium text-primary">{cn.creditNoteNumber}</TableCell>
                  <TableCell>{cn.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">{cn.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={`${TYPE_COLORS[cn.type] ?? ""} hover:opacity-80`} variant="secondary">
                      {TYPE_LABELS[cn.type] ?? cn.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[cn.status] ?? ""} hover:opacity-80`} variant="secondary">
                      {cn.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-destructive">−₹{Number(cn.amount).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-muted-foreground">{cn.createdAt ? format(new Date(cn.createdAt), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingCn(cn)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {creditNotes.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + creditNotes.length} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CreditNoteFormDialog open={formOpen} onOpenChange={(v) => setFormOpen(v)} />

      <AlertDialog open={!!deletingCn} onOpenChange={(open) => !open && setDeletingCn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credit Note "{deletingCn?.creditNoteNumber}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Stock adjustments already made will not be reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingCn && deleteMutation.mutate(deletingCn.id, { onSuccess: () => setDeletingCn(null) })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
