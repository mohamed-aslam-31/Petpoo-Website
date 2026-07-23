import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Tags,
  Briefcase,
  ArrowRightLeft,
  ShoppingBag,
  FileText,
  ClipboardList,
  FileMinus,
  ShoppingCart,
  Users,
  Building2,
  UserSquare2,
  CreditCard,
  Receipt,
  LineChart,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    name: "Inventory",
    items: [
      { name: "Products", href: "/inventory/products", icon: Package },
      { name: "Categories", href: "/inventory/categories", icon: Tags },
      { name: "Brands", href: "/inventory/brands", icon: Briefcase },
      { name: "Stock Movements", href: "/inventory/stock", icon: ArrowRightLeft },
      { name: "Purchases", href: "/inventory/purchases", icon: ShoppingBag },
    ]
  },
  {
    name: "Billing",
    items: [
      { name: "Invoices", href: "/billing/invoices", icon: FileText },
      { name: "Quotations", href: "/billing/quotations", icon: ClipboardList },
      { name: "Credit Notes", href: "/billing/credit-notes", icon: FileMinus },
    ]
  },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Suppliers", href: "/suppliers", icon: Building2 },
  { name: "Employees", href: "/employees", icon: UserSquare2 },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Reports", href: "/reports", icon: LineChart },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card shadow-sm hidden md:flex">
      <div className="flex h-14 items-center px-6 border-b">
        <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            S
          </div>
          ShopFlow ERP
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-6 px-4">
          {navigation.map((item, index) => {
            if (item.items) {
              return (
                <div key={index} className="space-y-1">
                  <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {item.name}
                  </h3>
                  {item.items.map((subItem) => {
                    const isActive = location === subItem.href;
                    return (
                      <Link key={subItem.name} href={subItem.href} className="block">
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <subItem.icon className="h-4 w-4" />
                          {subItem.name}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href} className="block">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
