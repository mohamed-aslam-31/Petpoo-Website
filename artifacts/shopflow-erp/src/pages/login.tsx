import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { Store, TrendingUp, PackageSearch } from "lucide-react";
import { setAuthData } from "@/lib/auth";

export function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthData(email);
    setLocation("/dashboard");
  };

  return (
    <div className="flex min-h-screen bg-background w-full">
      {/* Left side - Branding */}
      <div className="hidden lg:flex w-1/2 bg-primary flex-col justify-between p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-black/10 rounded-full blur-3xl"></div>
        
        <div className="z-10">
          <div className="flex items-center gap-2 font-bold text-2xl mb-12">
            <div className="h-10 w-10 rounded bg-white text-primary flex items-center justify-center">
              S
            </div>
            ShopFlow ERP
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
              Control every aspect of your wholesale business.
            </h1>
            <p className="text-primary-foreground/80 text-lg max-w-md">
              The professional operating system for serious retail and wholesale merchants. Inventory, billing, and accounting in one place.
            </p>
          </motion.div>
        </div>

        <div className="z-10 grid grid-cols-2 gap-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-lg">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold">Multi-Store</div>
              <div className="text-sm text-primary-foreground/70">Manage all locations</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-lg">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold">Real-time Analytics</div>
              <div className="text-sm text-primary-foreground/70">Live profit tracking</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-2">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@shopflow.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-sm font-medium text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="font-normal text-muted-foreground cursor-pointer">
                Remember me for 30 days
              </Label>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold">
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
