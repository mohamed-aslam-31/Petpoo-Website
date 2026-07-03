import { useRoute } from "wouter";
import { useGetCustomer, useGetCustomerLedger } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Phone, Mail, MapPin, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";

export function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id ? parseInt(params.id, 10) : 0;

  const { data: customer, isLoading: isLoadingCustomer } = useGetCustomer(customerId, {
    query: { enabled: !!customerId }
  });
  
  const { data: ledger, isLoading: isLoadingLedger } = useGetCustomerLedger(customerId, {
    query: { enabled: !!customerId }
  });

  if (isLoadingCustomer) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
  }

  if (!customer) {
    return <div className="p-8 text-center text-muted-foreground">Customer not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
            <Badge variant={customer.status === 'active' ? 'default' : 'secondary'} className={customer.status === 'active' ? "bg-green-100 text-green-700" : ""}>
              {customer.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Code: {customer.customerCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm font-medium">Phone</div>
                <div className="text-sm text-muted-foreground">{customer.phone}</div>
              </div>
            </div>
            {customer.email && (
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Email</div>
                  <div className="text-sm text-muted-foreground">{customer.email}</div>
                </div>
              </div>
            )}
            {customer.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Address</div>
                  <div className="text-sm text-muted-foreground">{customer.address}</div>
                </div>
              </div>
            )}
            {customer.gstNumber && (
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">GST Number</div>
                  <div className="text-sm text-muted-foreground uppercase">{customer.gstNumber}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ledger & Transactions</CardTitle>
            <div className="text-right">
              <div className="text-sm text-muted-foreground font-medium">Current Outstanding</div>
              <div className={`text-2xl font-bold ${customer.outstanding && customer.outstanding > 0 ? "text-amber-600" : "text-green-600"}`}>
                ₹{customer.outstanding || 0}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit (+)</TableHead>
                  <TableHead className="text-right">Credit (-)</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingLedger ? (
                   Array(3).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : ledger?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No ledger entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledger?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">{entry.description}</TableCell>
                      <TableCell className="text-right text-amber-600 font-medium">
                        {entry.debit > 0 ? `₹${entry.debit}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {entry.credit > 0 ? `₹${entry.credit}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        ₹{entry.balance}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
