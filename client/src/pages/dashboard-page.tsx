import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardStats } from "@/components/dashboard/stats";
import { RecentlyVisitedLocations } from "@/components/dashboard/recently-visited-locations";

export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Welcome back, {user?.displayName || user?.username || "Traveler"}!
            </h1>
            <p className="text-neutral-500 mt-1">
              Plan your next adventure with friends and family
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <Button 
              onClick={() => navigate("/trips/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create New Trip
            </Button>
          </div>
        </div>
        
        {/* Quick stats */}
        <DashboardStats />
        
        {/* Recently Visited Locations */}
        <RecentlyVisitedLocations />
      </div>
    </AppShell>
  );
}
