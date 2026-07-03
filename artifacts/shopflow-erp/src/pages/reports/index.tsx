import { useGetProfitLossReport, useGetSalesReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Area, AreaChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, TrendingUp, TrendingDown, FileText } from "lucide-react";

export function Reports() {
  const { data: profitLoss, isLoading: isLoadingPl } = useGetProfitLossReport();
  const { data: sales, isLoading: isLoadingSales } = useGetSalesReport({ period: 'monthly' });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
        <p className="text-muted-foreground mt-1">Deep dive into your business performance and financials.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingPl ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className={`text-2xl font-bold ${profitLoss?.netProfit && profitLoss.netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                  ₹{profitLoss?.netProfit?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">For current period</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingPl ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-primary">₹{profitLoss?.revenue?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Before expenses</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingPl ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-amber-600">₹{profitLoss?.expenses?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Operational costs</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSales ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold">
                  {sales?.reduce((acc, row) => acc + row.totalInvoices, 0) || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Generated this period</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Sales Performance</TabsTrigger>
          <TabsTrigger value="profit">Profit & Loss</TabsTrigger>
        </TabsList>
        
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue vs Sales Volume</CardTitle>
              <CardDescription>Monthly sales performance over the reporting period.</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {isLoadingSales ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : sales && sales.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sales} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" tickFormatter={(value) => `₹${value}`} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'totalRevenue' ? `₹${value.toLocaleString()}` : value, 
                        name === 'totalRevenue' ? 'Revenue' : 'Sales Volume'
                      ]} 
                    />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="totalRevenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" />
                    <Line yAxisId="right" type="monotone" dataKey="totalSales" stroke="#f59e0b" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
                  No sales data available for the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Expense Breakdown</CardTitle>
              <CardDescription>Distribution of expenses across categories.</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {isLoadingPl ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : profitLoss?.breakdown && profitLoss.breakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitLoss.breakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="category" />
                    <YAxis tickFormatter={(value) => `₹${value}`} />
                    <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']} />
                    <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
                  No expense data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
