import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useListCustomers, useListProducts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Trash2, Edit, Eye, FileText, ArrowRight, Filter, X, ChevronDown } from "lucide-react";

const PAGE_SIZE = 20;
const QK = ["quotations"] as const;
const today = () => new Date().toISOString().split("T")[0];

const STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
type QuotationStatus = typeof STATUSES[number];

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function useQuotations(params: { page: number; search?: string; status?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(PAGE_SIZE) });
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  return useQuery({ queryKey: [...QK, params], queryFn: () => apiFetch(`/quotations?${qs}`) });
}

function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch("/quotations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation created"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to create"),
  });
}

function useUpdateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation updated"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });
}

function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/quotations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast.success("Quotation deleted"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });
}

function useBulkDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => apiFetch("/quotations/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: QK }); toast.success(`Deleted ${data?.deleted ?? 0} quotation(s)`); },
    onError: (e: any) => toast.error(e.message ?? "Bulk delete failed"),
  });
}

function useBulkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: string }) =>
      apiFetch("/quotations/bulk-status", { method: "PATCH", body: JSON.stringify({ ids, status }) }),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: QK }); toast.success(`Updated ${data?.updated ?? 0} quotation(s)`); },
    onError: (e: any) => toast.error(e.message ?? "Bulk status update failed"),
  });
}

// ── PDF generation ────────────────────────────────────────────────────────────
function printQuotationPDF(q: any) {
  const fmtINR = (v: number) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const isGst = q.type === "gst";
  const items: any[] = Array.isArray(q.items) ? q.items : [];

  const rows = items.map((item: any) => {
    const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100);
    const gstAmt = isGst ? base * ((Number(item.gstPercent) || 0) / 100) : 0;
    return `
      <tr>
        <td>${item.productName ?? "—"}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${fmtINR(Number(item.unitPrice))}</td>
        ${isGst ? `<td style="text-align:center">${item.gstPercent ?? 0}%</td>` : ""}
        <td style="text-align:center">${item.discount ?? 0}%</td>
        <td style="text-align:right">${fmtINR(base + gstAmt)}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Quotation ${q.quotationNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #555; margin-bottom: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: #e2e8f0; color: #334155; }
    .badge.accepted { background: #dcfce7; color: #166534; }
    .badge.rejected { background: #fee2e2; color: #991b1b; }
    .badge.sent { background: #dbeafe; color: #1e40af; }
    .badge.draft { background: #f1f5f9; color: #475569; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .meta-box { padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
    .meta-box h3 { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
    .meta-box p { margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .totals { margin-left: auto; width: 280px; }
    .totals table td { border: none; padding: 4px 8px; }
    .totals table tr.total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #e2e8f0; padding-top: 8px; color: #1e40af; }
    .notes { margin-top: 16px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #cbd5e1; border-radius: 0 4px 4px 0; font-size: 11px; color: #475569; }
    .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>QUOTATION</h1>
      <p class="subtitle">${q.quotationNumber} &nbsp;|&nbsp; ${q.date ? format(new Date(q.date), "dd MMM yyyy") : "—"} &nbsp;|&nbsp; <span class="badge ${q.status}">${q.status}</span></p>
    </div>
    <div style="text-align:right; font-size:11px; color:#555;">
      <strong>Type:</strong> ${q.type === "gst" ? "GST" : "Non-GST"}
    </div>
  </div>

  <div class="meta">
    <div class="meta-box">
      <h3>Customer</h3>
      <p><strong>${q.customerName ?? "—"}</strong></p>
      ${q.customerShopName ? `<p>${q.customerShopName}</p>` : ""}
      ${q.customerPhone ? `<p>📞 ${q.customerPhone}</p>` : ""}
      ${q.customerEmail ? `<p>✉ ${q.customerEmail}</p>` : ""}
      ${q.customerGstAddress ? `<p>${q.customerGstAddress}</p>` : ""}
      ${(q.customerCity || q.customerState) ? `<p>${[q.customerCity, q.customerState].filter(Boolean).join(", ")}</p>` : ""}
    </div>
    <div class="meta-box">
      <h3>Quotation Details</h3>
      <p><strong>Number:</strong> ${q.quotationNumber}</p>
      <p><strong>Date:</strong> ${q.date ? format(new Date(q.date), "dd MMM yyyy") : "—"}</p>
      <p><strong>Status:</strong> ${q.status}</p>
      <p><strong>Type:</strong> ${q.type === "gst" ? "GST Invoice" : "Non-GST Invoice"}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        ${isGst ? `<th style="text-align:center">GST%</th>` : ""}
        <th style="text-align:center">Disc%</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${fmtINR(q.subtotal)}</td></tr>
      ${isGst ? `<tr><td>GST Amount</td><td style="text-align:right">${fmtINR(q.gstAmount)}</td></tr>` : ""}
      ${q.transport > 0 ? `<tr><td>Transport</td><td style="text-align:right">${fmtINR(q.transport)}</td></tr>` : ""}
      ${q.packageCharge > 0 ? `<tr><td>Packaging</td><td style="text-align:right">${fmtINR(q.packageCharge)}</td></tr>` : ""}
      ${q.otherCharge > 0 ? `<tr><td>Other Charges</td><td style="text-align:right">${fmtINR(q.otherCharge)}</td></tr>` : ""}
      <tr class="total-row"><td>Grand Total</td><td style="text-align:right">${fmtINR(q.total)}</td></tr>
    </table>
  </div>

  ${q.notes ? `<div class="notes"><strong>Notes:</strong> ${q.notes}</div>` : ""}

  <div class="footer">Generated on ${format(new Date(), "dd MMM yyyy, hh:mm a")}</div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked — please allow pop-ups for PDF download"); return; }
  win.document.write(html);
  win.document.close();
}

// ── Form schema ───────────────────────────────────────────────────────────────
const itemSchema = z.object({
  productId: z.coerce.number().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().min(0.01, "Qty required"),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
});

const baseFields = {
  type: z.enum(["gst", "non_gst"]),
  date: z.string().min(1, "Date required"),
  transport: z.coerce.number().min(0).optional(),
  packageCharge: z.coerce.number().min(0).optional(),
  otherCharge: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  items: z.array(itemSchema).min(1, "At least one item required"),
};

const existingCustSchema = z.object({ customerMode: z.literal("existing"), customerId: z.coerce.number().min(1, "Customer required"), ...baseFields });
const newCustSchema = z.object({
  customerMode: z.literal("new"),
  customerName: z.string().min(1, "Name required"),
  customerPhone: z.string().min(1, "Phone required"),
  customerShopName: z.string().optional(),
  customerLandline: z.string().optional(),
  customerEmail: z.string().optional(),
  customerShopType: z.enum(["retail", "wholesale", "both"]),
  customerGstAddress: z.string().optional(),
  customerCity: z.string().optional(),
  customerState: z.string().optional(),
  ...baseFields,
});

const schema = z.discriminatedUnion("customerMode", [existingCustSchema, newCustSchema]);
type FormValues = z.infer<typeof schema>;

const emptyItem = { productId: undefined, productName: "", quantity: 1, unitPrice: 0, discount: 0, gstPercent: 0 };

function defaultValues(): FormValues {
  return { customerMode: "existing", customerId: 0, type: "gst", date: today(), transport: 0, packageCharge: 0, otherCharge: 0, notes: "", status: "draft", items: [{ ...emptyItem }] } as any;
}

// ── Quotation Form Dialog ─────────────────────────────────────────────────────
function QuotationFormDialog({ open, onOpenChange, quotation }: { open: boolean; onOpenChange: (v: boolean) => void; quotation?: any | null }) {
  const isEditing = !!quotation;
  const form = useForm<FormValues>({ resolver: zodResolver(schema) as any, defaultValues: defaultValues() });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { data: customers } = useListCustomers({ limit: 300 });
  const { data: products } = useListProducts({ limit: 500 });
  const createMutation = useCreateQuotation();
  const updateMutation = useUpdateQuotation();

  const customerMode = form.watch("customerMode" as any);
  const qType = form.watch("type");
  const watchedItems = form.watch("items");

  useEffect(() => {
    if (!open) return;
    if (quotation) {
      form.reset({
        customerMode: quotation.isNewCustomer ? "new" : "existing",
        customerId: quotation.customerId ?? 0,
        customerName: quotation.customerName ?? "",
        customerPhone: quotation.customerPhone ?? "",
        customerShopName: quotation.customerShopName ?? "",
        customerLandline: quotation.customerLandline ?? "",
        customerEmail: quotation.customerEmail ?? "",
        customerShopType: (quotation.customerShopType as any) ?? "retail",
        customerGstAddress: quotation.customerGstAddress ?? "",
        customerCity: quotation.customerCity ?? "",
        customerState: quotation.customerState ?? "",
        type: quotation.type ?? "gst",
        date: quotation.date ?? today(),
        transport: quotation.transport ?? 0,
        packageCharge: quotation.packageCharge ?? 0,
        otherCharge: quotation.otherCharge ?? 0,
        notes: quotation.notes ?? "",
        status: quotation.status ?? "draft",
        items: quotation.items?.length ? quotation.items : [{ ...emptyItem }],
      } as any);
    } else {
      form.reset(defaultValues());
    }
  }, [open, quotation]);

  const transport = Number(form.watch("transport")) || 0;
  const packageCharge = Number(form.watch("packageCharge")) || 0;
  const otherCharge = Number(form.watch("otherCharge")) || 0;
  const itemsSubtotal = watchedItems.reduce((sum, item) => {
    const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100);
    const gst = qType === "gst" ? base * ((Number(item.gstPercent) || 0) / 100) : 0;
    return sum + base + gst;
  }, 0);
  const grandTotal = itemsSubtotal + transport + packageCharge + otherCharge;

  function handleProductChange(index: number, productId: string) {
    const product = products?.data?.find((p) => p.id === Number(productId));
    if (product) {
      form.setValue(`items.${index}.productId` as any, Number(productId));
      form.setValue(`items.${index}.productName` as any, product.name);
      form.setValue(`items.${index}.unitPrice` as any, Number(product.retailPrice) || 0);
      form.setValue(`items.${index}.gstPercent` as any, Number(product.gstPercent) || 0);
    }
  }

  function onSubmit(values: FormValues) {
    const isNew = values.customerMode === "new";
    const payload: any = {
      isNewCustomer: isNew,
      customerId: isNew ? null : (values as any).customerId,
      type: values.type,
      date: values.date,
      transport: values.transport ?? 0,
      packageCharge: values.packageCharge ?? 0,
      otherCharge: values.otherCharge ?? 0,
      notes: values.notes,
      status: values.status ?? "draft",
      items: values.items,
    };
    if (isNew) {
      const v = values as any;
      Object.assign(payload, {
        customerName: v.customerName, customerPhone: v.customerPhone,
        customerShopName: v.customerShopName, customerLandline: v.customerLandline,
        customerEmail: v.customerEmail, customerShopType: v.customerShopType,
        customerGstAddress: v.customerGstAddress, customerCity: v.customerCity,
        customerState: v.customerState,
      });
    }
    if (isEditing && quotation) {
      updateMutation.mutate({ id: quotation.id, data: payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Quotation" : "Create Quotation"}</DialogTitle>
          <DialogDescription>Fill in customer details and line items for the quotation.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Customer Mode */}
            <div className="flex gap-2">
              <Button type="button" variant={customerMode === "existing" ? "default" : "outline"} size="sm" onClick={() => form.setValue("customerMode" as any, "existing")}>Existing Customer</Button>
              <Button type="button" variant={customerMode === "new" ? "default" : "outline"} size="sm" onClick={() => form.setValue("customerMode" as any, "new")}>New Customer</Button>
            </div>

            {customerMode === "existing" ? (
              <FormField control={form.control} name={"customerId" as any} render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                    <SelectContent>{customers?.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.shopName ? ` — ${c.shopName}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-3 border rounded-md bg-muted/20">
                <p className="col-span-2 text-sm font-medium text-muted-foreground mb-1">New Customer Details</p>
                <FormField control={form.control} name={"customerName" as any} render={({ field }) => (<FormItem><FormLabel>Name *</FormLabel><FormControl><Input placeholder="Customer name" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerPhone" as any} render={({ field }) => (<FormItem><FormLabel>Phone *</FormLabel><FormControl><Input placeholder="Mobile number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerShopName" as any} render={({ field }) => (<FormItem><FormLabel>Shop Name</FormLabel><FormControl><Input placeholder="Shop / business name" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerLandline" as any} render={({ field }) => (<FormItem><FormLabel>Landline</FormLabel><FormControl><Input placeholder="Landline number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerEmail" as any} render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Email address" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerShopType" as any} render={({ field }) => (
                  <FormItem><FormLabel>Shop Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="both">Both Retail & Wholesale</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name={"customerGstAddress" as any} render={({ field }) => (<FormItem><FormLabel>GST Address</FormLabel><FormControl><Input placeholder="GST billing address" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerCity" as any} render={({ field }) => (<FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="City" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name={"customerState" as any} render={({ field }) => (<FormItem><FormLabel>State</FormLabel><FormControl><Input placeholder="State" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Quotation Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="gst">GST</SelectItem><SelectItem value="non_gst">Non-GST</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name={"status" as any} render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Items</h4>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ ...emptyItem } as any)}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid gap-2 items-end p-2 rounded-md bg-muted/30" style={{ gridTemplateColumns: qType === "gst" ? "3fr 1fr 1fr 1fr 1fr auto" : "3fr 1fr 1fr 1fr auto" }}>
                  <div>
                    <label className="text-xs font-medium leading-none mb-1 block">Product</label>
                    <Select onValueChange={(v) => handleProductChange(index, v)} value={watchedItems[index]?.productId ? String(watchedItems[index].productId) : ""}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select product..." /></SelectTrigger>
                      <SelectContent>{products?.data?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><label className="text-xs font-medium leading-none mb-1 block">Qty</label><Input type="number" className="h-8 text-xs" {...form.register(`items.${index}.quantity`)} /></div>
                  <div><label className="text-xs font-medium leading-none mb-1 block">Price (₹)</label><Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.unitPrice`)} /></div>
                  {qType === "gst" && <div><label className="text-xs font-medium leading-none mb-1 block">GST%</label><Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.gstPercent`)} /></div>}
                  <div><label className="text-xs font-medium leading-none mb-1 block">Disc%</label><Input type="number" step="0.01" className="h-8 text-xs" {...form.register(`items.${index}.discount`)} /></div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name={"transport" as any} render={({ field }) => (<FormItem><FormLabel>Transport (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name={"packageCharge" as any} render={({ field }) => (<FormItem><FormLabel>Packaging (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name={"otherCharge" as any} render={({ field }) => (<FormItem><FormLabel>Other Charges (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>)} />
            </div>

            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t">
              <span className="text-muted-foreground">Grand Total</span>
              <span className="text-lg font-bold text-primary">₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <FormField control={form.control} name={"notes" as any} render={({ field }) => (<FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional notes..." {...field} /></FormControl></FormItem>)} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Quotation"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── View Dialog ───────────────────────────────────────────────────────────────
function QuotationViewDialog({ open, onOpenChange, quotation }: { open: boolean; onOpenChange: (v: boolean) => void; quotation: any | null }) {
  if (!quotation) return null;
  const isGst = quotation.type === "gst";
  const items: any[] = Array.isArray(quotation.items) ? quotation.items : [];
  const fmtINR = (v: number) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{quotation.quotationNumber}</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge className={STATUS_COLORS[quotation.status] ?? "bg-slate-100 text-slate-700"} variant="secondary">{quotation.status}</Badge>
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{quotation.type.replace("_", " ")}</Badge>
            </div>
          </div>
          <DialogDescription>{quotation.date ? format(new Date(quotation.date), "dd MMM yyyy") : "—"}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-4 space-y-1 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Customer</p>
            <p className="font-semibold">{quotation.customerName}</p>
            {quotation.customerShopName && <p className="text-muted-foreground">{quotation.customerShopName}</p>}
            {quotation.customerPhone && <p>📞 {quotation.customerPhone}</p>}
            {quotation.customerEmail && <p>✉ {quotation.customerEmail}</p>}
            {quotation.customerGstAddress && <p className="text-muted-foreground">{quotation.customerGstAddress}</p>}
            {(quotation.customerCity || quotation.customerState) && <p className="text-muted-foreground">{[quotation.customerCity, quotation.customerState].filter(Boolean).join(", ")}</p>}
            {quotation.isNewCustomer && <Badge variant="outline" className="text-[10px] mt-1">New Customer</Badge>}
          </div>
          <div className="rounded-lg border p-4 space-y-1 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Financials</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtINR(quotation.subtotal)}</span></div>
            {isGst && <div className="flex justify-between"><span className="text-muted-foreground">GST Amount</span><span>{fmtINR(quotation.gstAmount)}</span></div>}
            {quotation.transport > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{fmtINR(quotation.transport)}</span></div>}
            {quotation.packageCharge > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Packaging</span><span>{fmtINR(quotation.packageCharge)}</span></div>}
            {quotation.otherCharge > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Other</span><span>{fmtINR(quotation.otherCharge)}</span></div>}
            <Separator className="my-2" />
            <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{fmtINR(quotation.total)}</span></div>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-center p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Unit Price</th>
                {isGst && <th className="text-center p-3 font-medium">GST%</th>}
                <th className="text-center p-3 font-medium">Disc%</th>
                <th className="text-right p-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => {
                const base = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (1 - (Number(item.discount) || 0) / 100);
                const gstAmt = isGst ? base * ((Number(item.gstPercent) || 0) / 100) : 0;
                return (
                  <tr key={i} className="border-t">
                    <td className="p-3">{item.productName ?? "—"}</td>
                    <td className="p-3 text-center">{item.quantity}</td>
                    <td className="p-3 text-right">{fmtINR(Number(item.unitPrice))}</td>
                    {isGst && <td className="p-3 text-center">{item.gstPercent ?? 0}%</td>}
                    <td className="p-3 text-center">{item.discount ?? 0}%</td>
                    <td className="p-3 text-right font-medium">{fmtINR(base + gstAmt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {quotation.notes && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <span className="font-medium">Notes: </span>{quotation.notes}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => printQuotationPDF(quotation)} className="gap-2">
            <FileText className="h-4 w-4" /> Download PDF
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge helpers ──────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export function Quotations() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);
  const [viewingQuotation, setViewingQuotation] = useState<any | null>(null);
  const [deletingQuotation, setDeletingQuotation] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  const { data, isLoading } = useQuotations({ page, search: search || undefined, status: statusFilter || undefined });
  const deleteMutation = useDeleteQuotation();
  const bulkDeleteMutation = useBulkDelete();
  const bulkStatusMutation = useBulkStatus();

  const quotations: any[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = quotations.map((q) => q.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return next; });
    }
  }

  function handleBulkDelete() {
    bulkDeleteMutation.mutate(Array.from(selectedIds), {
      onSuccess: () => { setSelectedIds(new Set()); setBulkDeleting(false); },
    });
  }

  function handleBulkStatus(status: string) {
    bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status }, {
      onSuccess: (data: any) => {
        setSelectedIds(new Set());
        setBulkStatusOpen(false);
        if (status === "accepted" && data?.ordersCreated > 0) {
          toast.success(`${data.ordersCreated} order${data.ordersCreated !== 1 ? "s" : ""} created automatically`, { description: "Find them in the Orders page." });
        }
      },
    });
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quotations</h2>
          <p className="text-muted-foreground mt-1">Manage price quotations for customers.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => { setEditingQuotation(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Create Quotation
        </Button>
      </div>

      <Card>
        {/* Search + Filter bar */}
        <div className="p-4 border-b bg-muted/20 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by quotation no. or customer..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-36 bg-background">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            {statusFilter && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setStatusFilter(""); setPage(1); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedCount > 0 && (
          <div className="px-4 py-2 border-b bg-primary/5 flex items-center gap-3">
            <span className="text-sm font-medium text-primary">{selectedCount} selected</span>
            <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setBulkDeleting(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </Button>
            <DropdownMenu open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Change Status <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {STATUSES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleBulkStatus(s)} disabled={bulkStatusMutation.isPending} className="capitalize cursor-pointer">
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                    className={somePageSelected && !allPageSelected ? "opacity-50" : ""}
                  />
                </TableHead>
                <TableHead>Quotation No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              )) : quotations.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No quotations found.</TableCell></TableRow>
              ) : quotations.map((q: any) => (
                <TableRow key={q.id} className={`hover:bg-muted/50 transition-colors ${selectedIds.has(q.id) ? "bg-primary/5" : ""}`}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(q.id)} onCheckedChange={() => toggleSelect(q.id)} aria-label={`Select ${q.quotationNumber}`} />
                  </TableCell>
                  <TableCell className="font-medium text-primary cursor-pointer" onClick={() => setViewingQuotation(q)}>{q.quotationNumber}</TableCell>
                  <TableCell>
                    {q.customerName}
                    {q.isNewCustomer && <Badge variant="outline" className="ml-2 text-[10px]">New</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{q.date ? format(new Date(q.date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{q.type.replace("_", " ")}</Badge></TableCell>
                  <TableCell><Badge className={`${STATUS_COLORS[q.status] ?? "bg-slate-100 text-slate-700"} hover:opacity-80`} variant="secondary">{q.status}</Badge></TableCell>
                  <TableCell className="text-right font-medium">₹{Number(q.total).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* View — always available */}
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setViewingQuotation(q)}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        {/* PDF — always available */}
                        <DropdownMenuItem className="cursor-pointer" onClick={() => printQuotationPDF(q)}>
                          <FileText className="mr-2 h-4 w-4" /> Download PDF
                        </DropdownMenuItem>

                        {/* Edit — only for draft and sent */}
                        {(q.status === "draft" || q.status === "sent") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingQuotation(q); setFormOpen(true); }}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                          </>
                        )}

                        {/* accepted quotations show a read-only indicator — auto-converted on status change */}
                        {q.status === "accepted" && q.convertedOrderNumber && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="text-green-700 opacity-70">
                              <ArrowRight className="mr-2 h-4 w-4" /> Order {q.convertedOrderNumber}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {quotations.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + quotations.length} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form dialog */}
      <QuotationFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingQuotation(null); }}
        quotation={editingQuotation}
      />

      {/* View dialog */}
      <QuotationViewDialog
        open={!!viewingQuotation}
        onOpenChange={(v) => !v && setViewingQuotation(null)}
        quotation={viewingQuotation}
      />

      {/* Single delete confirm */}
      <AlertDialog open={!!deletingQuotation} onOpenChange={(open) => !open && setDeletingQuotation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingQuotation?.quotationNumber}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this quotation.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingQuotation && deleteMutation.mutate(deletingQuotation.id, { onSuccess: () => setDeletingQuotation(null) })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleting} onOpenChange={setBulkDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} quotation{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the selected quotations. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
