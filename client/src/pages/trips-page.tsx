import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip, User } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

export default function TripsPage() { // Using as SchedulesPage
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { user, isAdmin } = useAuth();
  
  // First render flag to optimize initial load
  const firstRender = useRef(true);
  
  // Reference to last fetch time to avoid too frequent refreshes
  const lastRefreshTime = useRef(Date.now());
  const [loadError, setLoadError] = useState(false);
  
  // Track if we've shown the instant UI
  const [showingInstantUI, setShowingInstantUI] = useState(false);
  
  // Add type for useQuery response
  type ScheduleQueryResponse = Trip[];
  
  // Get all schedules with optimized settings for better performance
  const { data: trips, isLoading, refetch, isStale } = useQuery<ScheduleQueryResponse>({
    queryKey: ["/api/schedules"],
    staleTime: 30000, // Data considered fresh for 30 seconds
    gcTime: 300000, // Keep old data in cache for 5 minutes
    refetchOnMount: false, // We'll handle this manually
    refetchOnWindowFocus: false, // Don't automatically refetch on window focus
    refetchInterval: 60000, // Reduced from 10s to 60s to lower server load
    retry: 2, // Retry twice if request fails
    retryDelay: 1000, // Wait 1s between retries
    // Use a networkMode that prefers cached data for immediate display
    networkMode: 'offlineFirst',
    // Start with enabled false, we'll trigger manually for better UX
    enabled: false
  });
  
  // On first mount, trigger a load but show UI immediately
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      
      // Set instant UI
      setShowingInstantUI(true);
      
      // Delay the actual data fetch slightly for better initial render
      setTimeout(() => {
        refetch();
      }, 200);
    }
  }, [refetch]);

  // Manual refresh function with throttling to prevent excessive API calls
  const refreshData = () => {
    const now = Date.now();
    // Only allow refresh if at least 5 seconds have passed since last refresh
    if (now - lastRefreshTime.current > 5000) {
      console.log("Manually refreshing schedules data");
      lastRefreshTime.current = now;
      refetch();
    } else {
      console.log("Refresh throttled - please wait before refreshing again");
    }
  };

  // Type guard for Schedule objects
  const hasScheduleDisplayFields = (trip: Trip): trip is Trip & { 
    startLocationDisplay?: string; 
    destinationDisplay?: string;
  } => {
    return typeof trip === 'object' && trip !== null;
  };

  // Add error state UI element
  const ErrorNotice = loadError && (!trips || trips.length === 0) && (
    <div className="bg-amber-50 border border-amber-200 p-4 rounded-md mb-6">
      <p className="text-amber-800">
        <strong>Note:</strong> There was an issue loading the latest schedule data. 
        {!trips || trips.length === 0 ? " Please try refreshing." : " Showing cached data."}
      </p>
    </div>
  );

  // Add effect to handle errors from fetch
  useEffect(() => {
    // Set error state if trips query failed
    const handleQueryError = () => {
      if (!trips && !isLoading) {
        setLoadError(true);
      }
    };
    handleQueryError();
  }, [trips, isLoading]);

  // Memoize filtering logic to avoid recomputing on every render
  const { filteredSchedules, upcomingSchedules, pastSchedules, cancelledSchedules } = useMemo(() => {
    // Start by filtering for search and status
    const filtered = trips?.filter(schedule => {
      // Skip null/undefined schedules
      if (!schedule) return false;
      
      // Optimize search by only doing toLowerCase once per field
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        searchQuery === "" || 
        (schedule.name?.toLowerCase().includes(query)) ||
        (schedule.destination?.toLowerCase().includes(query)) ||
        (schedule.startLocation?.toLowerCase().includes(query));
      
      const matchesStatus = statusFilter === "all" || schedule.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    }) || [];
    
    // Get current time once for all comparisons
    const now = new Date();
    
    // Pre-define status check functions for better readability
    const isUpcoming = (s: Trip) => {
      // First check if status is one of the active types
      const hasActiveStatus = (s.status === "planning" || s.status === "confirmed" || 
                               s.status === "in-progress");
      // Then ensure it's not in any of the completed statuses                         
      const isNotFinished = (s.status !== "cancelled" && s.status !== "completed");
      
      return hasActiveStatus && isNotFinished;
    };
      
    const isPast = (s: Trip) => {
      if (!s.endDate) return false;
      try {
        const endDate = new Date(s.endDate);
        const isCompleted = s.status === "completed";
        const isPastEndDate = endDate < now && s.status !== "cancelled";
        const isOverdueInProgress = s.status === "in-progress" && endDate < now;
        
        return isCompleted || isPastEndDate || isOverdueInProgress;
      } catch (e) {
        return false;
      }
    };
    
    const isCancelled = (s: Trip) => s.status === "cancelled";
    
    // Categorize schedules in one pass through the data
    const upcoming: Trip[] = [];
    const past: Trip[] = [];
    const cancelled: Trip[] = [];
    
    filtered.forEach(schedule => {
      if (isCancelled(schedule)) {
        cancelled.push(schedule);
      } else if (isPast(schedule)) {
        past.push(schedule);
      } else if (isUpcoming(schedule)) {
        upcoming.push(schedule);
      }
    });
    
    return {
      filteredSchedules: filtered,
      upcomingSchedules: upcoming,
      pastSchedules: past,
      cancelledSchedules: cancelled
    };
  }, [trips, searchQuery, statusFilter]);

  // Get schedule IDs for each category
  const upcomingScheduleIds = upcomingSchedules?.map(schedule => schedule.id) || [];
  const pastScheduleIds = pastSchedules?.map(schedule => schedule.id) || [];
  const cancelledScheduleIds = cancelledSchedules?.map(schedule => schedule.id) || [];

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
              onClick={() => {
                console.log("Manually refreshing schedules data");
                refetch();
              }}
              className="h-9 w-9 text-lg font-bold"
              title="Refresh schedules"
            >
              ↻
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
          
          <TabsContent value="upcoming">
            {/* Expenses section removed */}

            {isLoading ? (
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
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7" />
                          <Skeleton className="h-7 w-16" />
                          <Skeleton className="h-7 w-7" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingSchedules && upcomingSchedules.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                {upcomingSchedules.map((schedule) => (
                  <TripCard key={schedule.id} trip={schedule} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming schedules</h3>
                <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
                <Button 
                  onClick={() => navigate("/schedules/new")}
                  className="inline-flex items-center"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Schedule
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="past">
            {/* Expenses section removed */}
            
            {isLoading ? (
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
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7" />
                          <Skeleton className="h-7 w-16" />
                          <Skeleton className="h-7 w-7" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pastSchedules && pastSchedules.length > 0 ? (
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
            {isLoading ? (
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
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7" />
                          <Skeleton className="h-7 w-16" />
                          <Skeleton className="h-7 w-7" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : cancelledSchedules && cancelledSchedules.length > 0 ? (
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

      {/* Expense Dialog */}
      {/* Expense dialog removed */}
    </AppShell>
  );
}
