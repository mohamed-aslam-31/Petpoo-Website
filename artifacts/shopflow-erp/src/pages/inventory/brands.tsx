import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useListBrands, useDeleteBrand, getListBrandsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { BrandFormDialog } from "./brand-form-dialog";

export function Brands() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });
  const filteredData = search ? data?.filter(b => b.name.toLowerCase().includes(search.toLowerCase())) : data;

  const deleteMutation = useDeleteBrand({
    mutation: {
      onSuccess: () => { toast.success("Brand deleted"); queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() }); setDeletingBrand(null); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Brands</h2>
          <p className="text-muted-foreground mt-1">Manage product brands and manufacturers.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => { setEditingBrand(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Brand
        </Button>
      </div>
      <Card>
        <div className="p-4 border-b flex gap-4 items-center bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search brands..." className="pl-9 bg-background" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(3).fill(0).map((_, i) => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-64" /></TableCell><TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell><TableCell><Skeleton className="h-8 w-8 rounded ml-auto" /></TableCell></TableRow>
              )) : filteredData?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">No brands found.</TableCell></TableRow>
              ) : filteredData?.map((brand) => (
                <TableRow key={brand.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell className="text-muted-foreground">{brand.description || "-"}</TableCell>
                  <TableCell className="text-right">{brand.productsCount || 0}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => { setEditingBrand(brand); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingBrand(brand)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BrandFormDialog open={formOpen} onOpenChange={setFormOpen} brand={editingBrand} />

      <AlertDialog open={!!deletingBrand} onOpenChange={(open) => !open && setDeletingBrand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingBrand?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this brand.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingBrand && deleteMutation.mutate({ id: deletingBrand.id })}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
