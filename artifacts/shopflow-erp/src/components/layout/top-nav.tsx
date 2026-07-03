import { Search, Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocation } from "wouter";

export function TopNav() {
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("shopflow_auth");
    setLocation("/");
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6 shadow-sm z-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative hidden w-96 md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search anywhere..."
            className="w-full bg-muted/50 pl-9 border-none focus-visible:bg-background"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleLogout}>
          <Avatar className="h-8 w-8 border">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">AD</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col md:flex">
            <span className="text-sm font-medium leading-none">Admin User</span>
            <span className="text-xs text-muted-foreground leading-none mt-1">Owner</span>
          </div>
        </div>
      </div>
    </header>
  );
}
