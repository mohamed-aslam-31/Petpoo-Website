import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListEmployees, useDeleteEmployee, getListEmployeesQueryKey } from "@workspace/api-client-react";
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
import { EmployeeFormDialog } from "./employee-form-dialog";

const PAGE_SIZE = 20;

export function Employees() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const listParams = { search: search || undefined, page, limit: PAGE_SIZE };
  const { data, isLoading } = useListEmployees(listParams, { query: { queryKey: getListEmployeesQueryKey(listParams) } });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteMutation = useDeleteEmployee({
    mutation: {
      onSuccess: () => { toast.success("Employee deleted"); queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() }); setDeletingEmployee(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 'bg-purple-100 text-purple-700 hover:bg-purple-100';
      case 'manager': return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
      case 'sales_staff': return 'bg-green-100 text-green-700 hover:bg-green-100';
      case 'warehouse': return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
      case 'accountant': return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
      default: return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Employees</h2>
          <p className="text-muted-foreground mt-1">Manage staff, roles, and payroll information.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => { setEditingEmployee(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>
      <Card>
        <div className="p-4 border-b flex gap-4 items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search employees..." className="pl-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joining Date</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-[200px]" /></TableCell><TableCell><Skeleton className="h-4 w-[150px]" /></TableCell><TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-[100px]" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell><TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No employees found.</TableCell></TableRow>
              ) : data?.data?.map((employee) => (
                <TableRow key={employee.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    {employee.name}
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">{employee.employeeCode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{employee.phone}</div>
                    {employee.email && <div className="text-xs text-muted-foreground">{employee.email}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getRoleColor(employee.role)}>{employee.role.replace(/_/g, ' ').toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(employee.joiningDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right font-medium">₹{employee.salary || 0}</TableCell>
                  <TableCell>
                    <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className={employee.status === 'active' ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>{employee.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingEmployee(employee); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingEmployee(employee)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
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

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editingEmployee} />

      <AlertDialog open={!!deletingEmployee} onOpenChange={(open) => !open && setDeletingEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingEmployee?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this employee record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingEmployee && deleteMutation.mutate({ id: deletingEmployee.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
