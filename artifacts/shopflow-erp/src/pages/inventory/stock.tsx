import { useState } from "react";
import { useListStockMovements, getListStockMovementsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowDownRight, ArrowUpRight, AlertTriangle, ShieldQuestion, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const PAGE_SIZE = 50;

export function Stock() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = { page, limit: PAGE_SIZE };
  const { data, isLoading } = useListStockMovements(
    params,
    { query: { queryKey: getListStockMovementsQueryKey(params) } }
  );

  // API returns a plain array
  const movements = Array.isArray(data) ? data : [];

  const filteredMovements = search
    ? movements.filter(m =>
        m.productName.toLowerCase().includes(search.toLowerCase()) ||
        m.reason.toLowerCase().includes(search.toLowerCase())
      )
    : movements;

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "increase": return <ArrowUpRight className="h-4 w-4 text-green-600" />;
      case "decrease": return <ArrowDownRight className="h-4 w-4 text-amber-600" />;
      case "damage":   return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "lost":     return <ShieldQuestion className="h-4 w-4 text-red-600" />;
      case "return":   return <RotateCcw className="h-4 w-4 text-blue-600" />;
      default: return null;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "increase": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Increase</Badge>;
      case "decrease": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Decrease</Badge>;
      case "damage":   return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Damage</Badge>;
      case "lost":     return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Lost</Badge>;
      case "return":   return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Return</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Movements</h2>
          <p className="text-muted-foreground mt-1">
            Full history of all inventory changes — sales, purchases, adjustments, damage, and returns.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4 bg-muted/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by product or reason..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(6).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  </TableRow>
                ))
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {search ? "No matching movements found." : "No stock movements yet. Create an order or invoice to see stock changes here."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.map((movement) => (
                  <TableRow key={movement.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                      {format(new Date(movement.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{movement.productName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMovementIcon(movement.type)}
                        {getMovementBadge(movement.type)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={movement.type === "increase" || movement.type === "return" ? "text-green-600" : "text-amber-700"}>
                        {movement.type === "increase" || movement.type === "return" ? "+" : "−"}{movement.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{movement.beforeStock}</TableCell>
                    <TableCell className="text-right font-semibold">{movement.afterStock}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[220px] text-sm" title={movement.reason}>
                      {movement.reason}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {movements.length > 0 && (
            <div className="border-t p-4 flex items-center justify-between text-sm text-muted-foreground bg-muted/20">
              <span>Showing {filteredMovements.length} of {movements.length} movements this page</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={movements.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
