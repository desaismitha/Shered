import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  // Loading states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  
  // Get schedules with tanstack query
  const { 
    data: schedules = [], 
    isLoading, 
    refetch, 
    error,
    isError
  } = useQuery<Trip[]>({
    queryKey: ["/api/schedules"],
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // After initial load, hide skeletons with a slight delay for smoothness
  useEffect(() => {
    if (!isLoading || schedules.length > 0) {
      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, schedules]);

  // Manual refresh with user feedback
  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      await refetch();
      toast({
        title: "Schedules updated",
        description: "Latest data loaded successfully"
      });
    } catch (err) {
      toast({
        title: "Update failed",
        description: "Unable to fetch the latest data",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter schedules by search, status, and categorize them
  const { upcomingSchedules, pastSchedules, cancelledSchedules } = useMemo(() => {
    // Skip filtering if no data
    if (!schedules || schedules.length === 0) {
      return {
        upcomingSchedules: [],
        pastSchedules: [],
        cancelledSchedules: []
      };
    }

    const now = new Date();
    const lowercaseQuery = searchQuery.toLowerCase();
    
    // Prepare filtered arrays
    const upcoming: Trip[] = [];
    const past: Trip[] = [];
    const cancelled: Trip[] = [];
    
    // Single pass through data
    for (const schedule of schedules) {
      // Filter by search
      if (lowercaseQuery) {
        const matchesName = schedule.name?.toLowerCase().includes(lowercaseQuery);
        const matchesDestination = schedule.destination?.toLowerCase().includes(lowercaseQuery);
        const matchesLocation = schedule.startLocation?.toLowerCase().includes(lowercaseQuery);
        
        if (!matchesName && !matchesDestination && !matchesLocation) {
          continue;
        }
      }
      
      // Filter by status
      if (statusFilter !== "all" && schedule.status !== statusFilter) {
        continue;
      }
      
      // Categorize
      if (schedule.status === "cancelled") {
        cancelled.push(schedule);
      } else if (schedule.status === "completed" || 
                (schedule.endDate && new Date(schedule.endDate) < now)) {
        past.push(schedule);
      } else {
        // Planning, confirmed, or in-progress
        upcoming.push(schedule);
      }
    }
    
    // Sort
    upcoming.sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
    past.sort((a, b) => new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime());
    cancelled.sort((a, b) => a.name.localeCompare(b.name));
    
    return { upcomingSchedules, pastSchedules, cancelledSchedules };
  }, [schedules, searchQuery, statusFilter]);

  // Error notification
  const ErrorNotice = isError && (
    <div className="bg-amber-50 border border-amber-200 p-4 rounded-md mb-6">
      <p className="text-amber-800">
        <strong>Note:</strong> There was an issue loading the schedule data. 
        {schedules.length > 0 ? " Showing cached data." : " Please try refreshing."}
      </p>
    </div>
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">
              My Schedules
            </h1>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={refreshData}
              disabled={isRefreshing}
              className="h-9 w-9"
              title="Refresh schedules"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            {isAdmin() && (
              <Button 
                onClick={() => navigate("/schedules/new")}
                className="inline-flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create New Schedule
              </Button>
            )}
          </div>
        </div>
        
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search schedules by title or location"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <Tabs defaultValue="upcoming" className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="upcoming" onClick={() => setStatusFilter("all")}>
              Upcoming Schedules
            </TabsTrigger>
            <TabsTrigger value="past" onClick={() => setStatusFilter("all")}>
              Past Schedules
            </TabsTrigger>
            <TabsTrigger value="cancelled" onClick={() => setStatusFilter("cancelled")}>
              Cancelled Schedules
            </TabsTrigger>
          </TabsList>
          
          {/* Show error notice if applicable */}
          {ErrorNotice}
          
          <TabsContent value="upcoming">
            {showSkeleton || isLoading ? (
              <div className="space-y-1 border rounded overflow-hidden">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white border-b overflow-hidden">
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingSchedules.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                {upcomingSchedules.map((schedule) => (
                  <TripCard key={schedule.id} trip={schedule} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming schedules</h3>
                <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
                {isAdmin() && (
                  <Button 
                    onClick={() => navigate("/schedules/new")}
                    className="inline-flex items-center"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Create New Schedule
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="past">
            {showSkeleton || isLoading ? (
              <div className="space-y-1 border rounded overflow-hidden">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="bg-white border-b overflow-hidden">
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pastSchedules.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                {pastSchedules.map((schedule) => (
                  <TripCard key={schedule.id} trip={schedule} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No past schedules</h3>
                <p className="text-neutral-500">Your completed schedules will appear here</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="cancelled">
            {showSkeleton || isLoading ? (
              <div className="space-y-1 border rounded overflow-hidden">
                {[...Array(1)].map((_, i) => (
                  <div key={i} className="bg-white border-b overflow-hidden">
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : cancelledSchedules.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                {cancelledSchedules.map((schedule) => (
                  <TripCard key={schedule.id} trip={schedule} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No cancelled schedules</h3>
                <p className="text-neutral-500">Cancelled schedules will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}