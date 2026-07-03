import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListExpenses, useDeleteExpense, getListExpensesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ExpenseFormDialog } from "./expense-form-dialog";

const PAGE_SIZE = 20;

export function Expenses() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const listParams = { search: search || undefined, page, limit: PAGE_SIZE };
  const { data, isLoading } = useListExpenses(listParams, { query: { queryKey: getListExpensesQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteMutation = useDeleteExpense({
    mutation: {
      onSuccess: () => { toast.success("Expense deleted"); queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() }); setDeletingExpense(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground mt-1">Track and manage operational expenses.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>
      <Card>
        <div className="p-4 border-b flex gap-4 items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search expenses..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-[100px]" /></TableCell><TableCell><Skeleton className="h-4 w-[200px]" /></TableCell><TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-[100px]" /></TableCell><TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No expenses found.</TableCell></TableRow>
              ) : data?.data?.map((expense) => (
                <TableRow key={expense.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(expense.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">
                    {expense.title}
                    {expense.description && <div className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{expense.description}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="bg-slate-50 text-slate-700 capitalize">{expense.category}</Badge></TableCell>
                  <TableCell className="text-sm">{expense.paidBy || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={expense.status === 'paid' ? 'default' : 'secondary'} className={expense.status === 'paid' ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700"}>{expense.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-red-600">₹{expense.amount}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingExpense(expense); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingExpense(expense)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
            <div>Showing {data?.data?.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + (data?.data?.length ?? 0)} of {total}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editingExpense} />

      <AlertDialog open={!!deletingExpense} onOpenChange={(open) => !open && setDeletingExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingExpense?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this expense record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingExpense && deleteMutation.mutate({ id: deletingExpense.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
