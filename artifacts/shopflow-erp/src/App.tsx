import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "./components/layout/app-layout";
import { HISTORY_INDEX_KEY, NavigationGuardProvider, useNavigationGuard } from "./components/navigation-guard";

// Pages
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { Products } from "./pages/inventory/products";
import { Categories } from "./pages/inventory/categories";
import { Brands } from "./pages/inventory/brands";
import { Stock } from "./pages/inventory/stock";
import { Purchases } from "./pages/inventory/purchases";
import { PurchaseForm } from "./pages/inventory/purchase-form";
import { Invoices } from "./pages/billing/invoices";
import { Quotations } from "./pages/billing/quotations";
import { CreditNotes } from "./pages/billing/credit-notes";
import { Orders } from "./pages/orders";
import { Customers } from "./pages/customers";
import { CustomerDetail } from "./pages/customers/detail";
import { Suppliers } from "./pages/suppliers";
import { SupplierDetail } from "./pages/suppliers/detail";
import { Employees } from "./pages/employees";
import { Payments } from "./pages/payments";
import { Expenses } from "./pages/expenses";
import { Reports } from "./pages/reports";
import { Settings } from "./pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const auth = localStorage.getItem("shopflow_auth");
    if (!auth) {
      setLocation("/");
    } else {
      setIsAuthenticated(true);
    }
  }, [location, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />

      {/* Protected Routes */}
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/inventory/products" component={() => <ProtectedRoute component={Products} />} />
      <Route path="/inventory/categories" component={() => <ProtectedRoute component={Categories} />} />
      <Route path="/inventory/brands" component={() => <ProtectedRoute component={Brands} />} />
      <Route path="/inventory/stock" component={() => <ProtectedRoute component={Stock} />} />
      <Route path="/inventory/purchases" component={() => <ProtectedRoute component={Purchases} />} />
      <Route path="/inventory/purchases/new" component={() => <ProtectedRoute component={PurchaseForm} />} />
      <Route path="/billing/invoices" component={() => <ProtectedRoute component={Invoices} />} />
      <Route path="/billing/quotations" component={() => <ProtectedRoute component={Quotations} />} />
      <Route path="/billing/credit-notes" component={() => <ProtectedRoute component={CreditNotes} />} />
      <Route path="/orders" component={() => <ProtectedRoute component={Orders} />} />
      <Route path="/customers" component={() => <ProtectedRoute component={Customers} />} />
      <Route path="/customers/:id" component={() => <ProtectedRoute component={CustomerDetail} />} />
      <Route path="/suppliers" component={() => <ProtectedRoute component={Suppliers} />} />
      <Route path="/suppliers/:id" component={() => <ProtectedRoute component={SupplierDetail} />} />
      <Route path="/employees" component={() => <ProtectedRoute component={Employees} />} />
      <Route path="/payments" component={() => <ProtectedRoute component={Payments} />} />
      <Route path="/expenses" component={() => <ProtectedRoute component={Expenses} />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function GuardedRouter() {
  const { requestNavigation } = useNavigationGuard();
  const historyIndexRef = useRef<number>(
    Number.isInteger(window.history.state?.[HISTORY_INDEX_KEY])
      ? window.history.state[HISTORY_INDEX_KEY]
      : 0,
  );

  return (
    <WouterRouter
      base={import.meta.env.BASE_URL.replace(/\/$/, "")}
      aroundNav={(navigate, path, options) =>
        requestNavigation(path, () => {
          const nextIndex = options?.replace
            ? historyIndexRef.current
            : historyIndexRef.current + 1;
          const state = {
            ...(typeof options?.state === "object" && options.state ? options.state : {}),
            [HISTORY_INDEX_KEY]: nextIndex,
          };
          historyIndexRef.current = nextIndex;
          navigate(path, { ...options, state });
        })
      }
    >
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NavigationGuardProvider>
          <GuardedRouter />
        </NavigationGuardProvider>
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
