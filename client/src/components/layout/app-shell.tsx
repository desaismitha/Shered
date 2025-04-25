import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileHeader, MobileNav } from "./mobile-nav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen pt-16 md:pt-0">
      {/* Mobile header */}
      <MobileHeader />
      
      {/* Sidebar (desktop) */}
      <Sidebar />
      
      {/* Main content */}
      <main className="flex-1 md:ml-64 lg:ml-72 pb-16 md:pb-0">
        {children}
      </main>
      
      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
