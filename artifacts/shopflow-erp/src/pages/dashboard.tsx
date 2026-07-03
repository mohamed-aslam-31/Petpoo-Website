import { useGetDashboardSummary, useGetDashboardSalesChart, useGetDashboardTopProducts, useGetDashboardRecentOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndianRupee, ShoppingCart, Package, Users, Plus, FileText, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useState } from "react";
import { Link } from "wouter";
import { OrderFormDialog } from "./order-form-dialog";
import { InvoiceFormDialog } from "./billing/invoice-form-dialog";
import { CustomerFormDialog } from "./customers/customer-form-dialog";

export function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: salesData, isLoading: isSalesLoading } = useGetDashboardSalesChart();
  const { data: topProducts, isLoading: isProductsLoading } = useGetDashboardTopProducts();
  const { data: recentOrders, isLoading: isOrdersLoading } = useGetDashboardRecentOrders();

  const [orderOpen, setOrderOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  const stats = [
    {
      title: "Today's Sales",
      value: summary?.todaySales != null ? `₹${summary.todaySales.toLocaleString()}` : "₹0",
      icon: IndianRupee,
      trend: "+12.5%",
      trendUp: true,
    },
    {
      title: "Pending Orders",
      value: summary?.pendingOrders || 0,
      icon: ShoppingCart,
      trend: "-2.4%",
      trendUp: false,
    },
    {
      title: "Total Products",
      value: summary?.totalProducts || 0,
      icon: Package,
      trend: "+4.1%",
      trendUp: true,
    },
    {
      title: "Active Customers",
      value: summary?.totalCustomers || 0,
      icon: Users,
      trend: "+1.2%",
      trendUp: true,
    },
  ];

  const quickActions = [
    { label: "New Order", icon: ShoppingCart, color: "text-blue-600 bg-blue-50 hover:bg-blue-100", onClick: () => setOrderOpen(true) },
    { label: "New Invoice", icon: FileText, color: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100", onClick: () => setInvoiceOpen(true) },
    { label: "Add Customer", icon: Users, color: "text-violet-600 bg-violet-50 hover:bg-violet-100", onClick: () => setCustomerOpen(true) },
    { label: "Add Product", icon: Package, color: "text-amber-600 bg-amber-50 hover:bg-amber-100", href: "/inventory/products" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Here's what's happening with your business today.</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {quickActions.map((action) =>
          action.href ? (
            <Link key={action.label} href={action.href}>
              <button className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${action.color}`}>
                <action.icon className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />
              </button>
            </Link>
          ) : (
            <button key={action.label} onClick={action.onClick} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${action.color}`}>
              <action.icon className="h-5 w-5 shrink-0" />
              <span className="text-sm font-semibold">{action.label}</span>
              <Plus className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />
            </button>
          )
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isSummaryLoading
          ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          : stats.map((stat, index) => (
              <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                    <div className="p-2 bg-primary/10 rounded-md text-primary"><stat.icon className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className={`text-xs mt-1 font-medium ${stat.trendUp ? 'text-green-600' : 'text-red-600'}`}>{stat.trend} from last month</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader><CardTitle>Sales Overview</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {isSalesLoading ? (
              <Skeleton className="w-full h-full" />
            ) : salesData && salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(val) => new Date(val).getDate().toString()} />
                  <YAxis tickFormatter={(val) => `₹${val}`} />
                  <Tooltip formatter={(value: number) => [`₹${value}`, 'Sales']} labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">No sales data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {isProductsLoading ? (
              <Skeleton className="w-full h-full" />
            ) : topProducts && topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={12} width={100} />
                  <Tooltip formatter={(value: number) => [`₹${value}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">No product data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Orders</CardTitle>
          <Link href="/orders"><Button variant="outline" size="sm" className="gap-1">View All <ArrowRight className="h-3 w-3" /></Button></Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isOrdersLoading ? Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                </TableRow>
              )) : recentOrders?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recent orders.</TableCell></TableRow>
              ) : recentOrders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium text-primary">{order.orderNumber}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(order.createdAt), "MMM d")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={order.status === 'completed' ? 'bg-green-100 text-green-700' : order.status === 'pending' ? 'bg-amber-100 text-amber-700' : order.status === 'cancelled' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'}>{order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderFormDialog open={orderOpen} onOpenChange={setOrderOpen} />
      <InvoiceFormDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} />
      <CustomerFormDialog open={customerOpen} onOpenChange={setCustomerOpen} />
    </div>
  );
}
