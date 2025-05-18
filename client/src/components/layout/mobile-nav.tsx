import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Menu, X, Plane, LayoutDashboard, Users, Calendar, 
  DollarSign, MessageSquare, Settings, LogOut, Car,
  Navigation
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DbResetButton } from "@/components/ui/db-reset-button";
import { WebSocketIndicator } from "@/components/ui/websocket-indicator";

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow-sm flex items-center justify-between px-4 z-10 md:hidden">
        <div className="flex items-center">
          <button 
            type="button" 
            className="text-neutral-700 mr-3"
            onClick={() => setIsOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center">
            <img src="/trustloopz-logo.png" alt="TrustLoopz Logo" className="h-8 w-8 mr-2" />
            <h1 className="text-xl font-bold text-neutral-800">TrustLoopz</h1>
          </div>
        </div>
        <div className="flex items-center">
          <div className="mr-3">
            <WebSocketIndicator />
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 text-neutral-500 flex items-center justify-center">
            {user?.displayName?.[0] || user?.username?.[0] || "U"}
          </div>
        </div>
      </header>

      <MobileMenu isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
    onClose();
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Users, label: "My Groups", href: "/groups" },
    { icon: Calendar, label: "Upcoming Trips", href: "/trips" },
    { icon: Navigation, label: "Active Trips", href: "/active-trips" },
    { icon: Car, label: "My Vehicles", href: "/vehicles" },
    { icon: Users, label: "Import Members", href: "/bulk-import" },
    { icon: DollarSign, label: "Expenses", href: "/expenses" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
  ];

  return (
    <div className={cn(
      "fixed inset-0 flex z-40 md:hidden transform transition ease-in-out duration-300",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
        <div className="absolute top-0 right-0 -mr-12 pt-2">
          <button 
            onClick={onClose}
            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
          >
            <span className="sr-only">Close sidebar</span>
            <X className="h-6 w-6 text-white" />
          </button>
        </div>
        
        <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
          <div className="flex-shrink-0 flex items-center px-4">
            <div className="bg-blue-500 h-8 w-8 flex items-center justify-center rounded-md mr-2">
              <span className="text-white text-lg font-bold">T</span>
            </div>
            <span className="text-xl font-bold text-neutral-800">TrustLoopz</span>
          </div>
          <nav className="mt-5 px-2 space-y-1">
            {navItems.map((item) => {
              const isActive = 
                item.href === "/" 
                  ? location === "/"
                  : location.startsWith(item.href);
              
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "group flex items-center px-2 py-2 text-base font-medium rounded-md",
                    isActive 
                      ? "bg-primary-50 text-primary-700"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  )}
                >
                  <item.icon 
                    className={cn(
                      "text-lg mr-4 h-5 w-5",
                      isActive 
                        ? "text-primary-500"
                        : "text-neutral-500 group-hover:text-neutral-700"
                    )} 
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="flex-col flex border-t border-neutral-200 p-4">
          <div className="flex-shrink-0 group block w-full mb-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 text-neutral-500 flex items-center justify-center">
                {user?.displayName?.[0] || user?.username?.[0] || "U"}
              </div>
              <div className="ml-3">
                <p className="text-base font-medium text-neutral-800">
                  {user?.displayName || user?.username}
                </p>
                <button
                  onClick={handleLogout}
                  className="mt-1 text-sm font-medium text-neutral-500 group-hover:text-neutral-700 flex items-center"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
          
          {/* Database connection reset tool */}
          <div className="mt-2">
            <DbResetButton />
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 w-14"></div>
    </div>
  );
}

export function MobileNav() {
  const [location] = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Users, label: "Groups", href: "/groups" },
    { icon: Calendar, label: "Trips", href: "/trips" },
    { icon: Navigation, label: "Active", href: "/active-trips" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 flex justify-around items-center h-16 md:hidden z-10">
      {navItems.map((item) => {
        const isActive = 
          item.href === "/" 
            ? location === "/"
            : location.startsWith(item.href);
        
        return (
          <Link 
            key={item.href} 
            href={item.href}
            className="flex flex-col items-center justify-center w-full h-full"
          >
            <item.icon
              className={cn(
                "h-5 w-5",
                isActive 
                  ? "text-primary-600"
                  : "text-neutral-500"
              )}
            />
            <span className={cn(
              "text-xs mt-1",
              isActive 
                ? "text-primary-600"
                : "text-neutral-500"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
