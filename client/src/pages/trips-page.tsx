import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function TripsPage() { // Using as SchedulesPage
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  
  // Loading state tracking
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  
  // Type definition for schedules
  type ScheduleQueryResponse = Trip[];
  
  // Get schedules with optimized settings
  const { 
    data: trips, 
    isLoading, 
    refetch, 
    error 
  } = useQuery<ScheduleQueryResponse>({
    queryKey: ["/api/schedules"],
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchInterval: 60000,
    retry: 3,
    retryDelay: 1000
  });
  
  // Handle load errors and skeleton state
  useEffect(() => {
    // Set error state if query failed
    if (error) {
      setLoadError(true);
    }
    
    // Hide skeleton after initial load or if error
    if (!isLoading || error) {
      // Slightly delay hiding skeleton for smoother UX
      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, error]);
  
  // Manual refresh with user feedback
  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      await refetch();
      toast({
        title: "Schedules updated",
        description: "Latest schedule data loaded successfully",
      });
      setLoadError(false);
    } catch (err) {
      toast({
        title: "Error refreshing schedules",
        description: "Unable to fetch the latest data. Try again later.",
        variant: "destructive"
      });
      setLoadError(true);
    } finally {
      setIsRefreshing(false);
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

  // Simplified and optimized filtering logic
  const { upcomingSchedules, pastSchedules, cancelledSchedules } = useMemo(() => {
    // Default empty arrays for a clean UI if no data
    if (!trips || trips.length === 0) {
      return { 
        upcomingSchedules: [], 
        pastSchedules: [], 
        cancelledSchedules: [] 
      };
    }
    
    // Get current time once for all comparisons
    const now = new Date();
    
    // Prepare sorted containers
    const upcoming: Trip[] = [];
    const past: Trip[] = [];
    const cancelled: Trip[] = [];
    
    // Optimize search with lowercase query
    const query = searchQuery.toLowerCase();
    
    // Single pass through the data for better performance
    for (const schedule of trips) {
      // Skip invalid entries
      if (!schedule || !schedule.name) continue;
      
      // Search filter
      const nameMatch = !query || schedule.name.toLowerCase().includes(query);
      const destinationMatch = schedule.destination && 
        schedule.destination.toLowerCase().includes(query);
      const locationMatch = schedule.startLocation && 
        schedule.startLocation.toLowerCase().includes(query);
        
      const matchesSearch = nameMatch || destinationMatch || locationMatch;
      
      // Status filter - skip if doesn't match
      if (!matchesSearch) continue;
      if (statusFilter !== "all" && schedule.status !== statusFilter) continue;
      
      // Categorize the schedule
      if (schedule.status === "cancelled") {
        cancelled.push(schedule);
      }
      // Check if it's a past trip - completed or has past end date
      else if (
        schedule.status === "completed" || 
        (schedule.endDate && new Date(schedule.endDate) < now && schedule.status !== "cancelled")
      ) {
        past.push(schedule);
      } 
      // Otherwise it's an upcoming trip
      else if (
        schedule.status === "planning" || 
        schedule.status === "confirmed" || 
        schedule.status === "in-progress"
      ) {
        upcoming.push(schedule);
      }
    }
    
    // Sort the arrays (ascending start date for upcoming, descending end date for past)
    upcoming.sort((a, b) => 
      new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime()
    );
    
    past.sort((a, b) => 
      new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime()
    );
    
    cancelled.sort((a, b) => a.name.localeCompare(b.name));
    
    return { upcomingSchedules, pastSchedules, cancelledSchedules };
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
            <Button 
              onClick={() => navigate("/schedules/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create New Schedule
            </Button>
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
            {/* Error notification if applicable */}
            {ErrorNotice}
            
            {/* Ultra-fast loading UI - simple skeleton that appears instantly */}
            {(isLoading && !trips) || showSkeleton ? (
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
            {/* Error notification if applicable */}
            {ErrorNotice}
            
            {/* Ultra-fast loading UI - simple skeleton */}
            {(isLoading && !trips) || showSkeleton ? (
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
            {/* Error notification if applicable */}
            {ErrorNotice}
            
            {/* Ultra-fast loading UI - simple skeleton */}
            {(isLoading && !trips) || showSkeleton ? (
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
