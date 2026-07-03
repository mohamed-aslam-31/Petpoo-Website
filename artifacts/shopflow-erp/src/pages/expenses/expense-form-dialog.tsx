import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateExpense,
  useUpdateExpense,
  getListExpensesQueryKey,
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

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number().min(0.01, "Amount must be > 0"),
  category: z.string().min(1, "Category is required"),
  date: z.string().min(1, "Date is required"),
  description: z.string().optional(),
  paidBy: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface EditableExpense {
  id: number; title: string; amount: number; category: string;
  date: string; description?: string | null; paidBy?: string | null;
}

const today = new Date().toISOString().split("T")[0];
const empty: FormValues = { title: "", amount: 0, category: "miscellaneous", date: today, description: "", paidBy: "" };

export function ExpenseFormDialog({
  open, onOpenChange, expense,
}: { open: boolean; onOpenChange: (v: boolean) => void; expense?: EditableExpense | null }) {
  const isEditing = !!expense;
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) form.reset(expense ? { ...expense, description: expense.description ?? "", paidBy: expense.paidBy ?? "", date: expense.date.split("T")[0] } : empty);
  }, [open, expense, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });

  const createMutation = useCreateExpense({ mutation: { onSuccess: () => { toast.success("Expense added"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });
  const updateMutation = useUpdateExpense({ mutation: { onSuccess: () => { toast.success("Expense updated"); invalidate(); onOpenChange(false); }, onError: (e: any) => toast.error(e?.message ?? "Failed") } });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: FormValues) {
    if (isEditing && expense) updateMutation.mutate({ id: expense.id, data: values });
    else createMutation.mutate({ data: values });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Expense" : "Add Expense"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update expense details." : "Record a new business expense."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g. Electricity Bill" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="electricity">Electricity</SelectItem>
                      <SelectItem value="rent">Rent</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="internet">Internet</SelectItem>
                      <SelectItem value="miscellaneous">Miscellaneous</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paidBy" render={({ field }) => (
                <FormItem><FormLabel>Paid By</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Expense"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
