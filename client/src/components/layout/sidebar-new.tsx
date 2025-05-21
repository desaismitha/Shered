import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { 
  Plane, LayoutDashboard, Users, Calendar, DollarSign, 
  MessageSquare, Settings, LogOut, Car, MapPin,
  Navigation, PlusCircle, CalendarPlus, CheckCircle,
  User, CarTaxiFront, MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DbResetButton } from "@/components/ui/db-reset-button";
import { WebSocketIndicator } from "@/components/ui/websocket-indicator";

export function Sidebar() {
  const { user, logoutMutation, isAdmin } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: Users, label: "My Groups", href: "/groups" },
    { icon: Calendar, label: "My Schedules", href: "/schedules" },
    { icon: Navigation, label: "Active Schedules", href: "/active-schedules" },
    { icon: CheckCircle, label: "Check-in", href: "/check-in" },
    { icon: Car, label: "My Vehicles", href: "/vehicles" },
    { icon: CarTaxiFront, label: "Drivers", href: "/drivers" },
    { icon: Users, label: "Import Members", href: "/bulk-import" },
    { icon: DollarSign, label: "Expenses", href: "/expenses" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
  ];
  
  const actionItems = [
    { icon: PlusCircle, label: "Create Schedule", href: "/schedules/new" },
    { icon: CalendarPlus, label: "Create Event", href: "/events/new" },
  ];

  const footerItems = [
    { icon: User, label: "My Profile", href: "/profile" },
    { icon: Settings, label: "Settings", href: "/settings" },
    { icon: MessageCircle, label: "Share Feedback", href: "/feedback" },
    { icon: LogOut, label: "Logout", onClick: handleLogout },
  ];

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 flex-col fixed inset-y-0 left-0 border-r border-neutral-200 bg-white z-20">
      <div className="flex items-center h-16 px-6 border-b border-neutral-200">
        <Plane className="h-5 w-5 text-primary mr-2" />
        <h1 className="text-xl font-bold text-neutral-800">TrustLoopz</h1>
        <div className="ml-auto">
          <WebSocketIndicator />
        </div>
      </div>
      
      <nav className="flex-1 pt-4 pb-4 overflow-y-auto">
        <div className="px-4 mb-6">
          <Link href="/profile">
            <div className="flex items-center px-2 mb-2 cursor-pointer hover:bg-neutral-100 rounded-md py-2 transition-colors">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 text-neutral-500 flex items-center justify-center">
                {user?.displayName?.[0] || user?.username?.[0] || "U"}
              </div>
              <div className="ml-3">
                <div className="text-sm font-medium text-neutral-800">
                  {user?.displayName || user?.username}
                </div>
                <div className="text-xs text-neutral-500">
                  Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString()}
                </div>
              </div>
              <div className="ml-auto text-neutral-400">
                <User className="h-4 w-4" />
              </div>
            </div>
          </Link>
        </div>
      
        <div className="space-y-1 px-4">
          {navItems.map((item) => {
            const isActive = 
              item.href === "/" 
                ? location === "/"
                : location.startsWith(item.href);
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center px-2 py-2 text-sm font-medium rounded-md group",
                  isActive 
                    ? "bg-primary-50 text-primary-700"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                )}
              >
                <item.icon 
                  className={cn(
                    "text-lg mr-3 h-5 w-5",
                    isActive 
                      ? "text-primary-500"
                      : "text-neutral-500 group-hover:text-neutral-700"
                  )} 
                />
                {item.label}
              </Link>
            );
          })}
        </div>
        
        {/* Only show Quick Actions section if user is an admin */}
        {isAdmin() && (
          <div className="mt-6 px-4">
            <h3 className="px-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="mt-2 space-y-1">
              {actionItems.map((item) => {
                const isActive = location.startsWith(item.href);
                
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    className={cn(
                      "flex items-center px-2 py-2 text-sm font-medium rounded-md group",
                      isActive 
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    <item.icon 
                      className={cn(
                        "text-lg mr-3 h-5 w-5",
                        isActive 
                          ? "text-primary-500"
                          : "text-neutral-500 group-hover:text-neutral-700"
                      )} 
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
      
      <div className="border-t border-neutral-200 p-4">
        {footerItems.map((item) => (
          item.onClick ? (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex w-full items-center px-2 py-2 text-sm font-medium rounded-md text-neutral-700 hover:bg-neutral-100"
            >
              <item.icon className="text-lg mr-3 h-5 w-5 text-neutral-500" />
              {item.label}
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href!}
              className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-neutral-700 hover:bg-neutral-100"
            >
              <item.icon className="text-lg mr-3 h-5 w-5 text-neutral-500" />
              {item.label}
            </Link>
          )
        ))}
        
        {/* Database connection reset tool */}
        <div className="mt-4 px-2">
          <DbResetButton />
        </div>
      </div>
    </aside>
  );
}