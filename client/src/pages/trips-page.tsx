import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip, User } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

export default function TripsPage() { // Using as SchedulesPage
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { user } = useAuth();
  
  // Get all schedules
  const { data: trips, isLoading, refetch } = useQuery<Trip[]>({
    queryKey: ["/api/schedules"],
    staleTime: 0,
    gcTime: 0, // Don't keep old data in cache at all
    refetchOnMount: "always", // Always refetch on mount
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Debug logging for schedules data
  console.log("Schedules data from API:", trips);

  // Type guard for Schedule objects
  const hasScheduleDisplayFields = (trip: Trip): trip is Trip & { 
    startLocationDisplay?: string; 
    destinationDisplay?: string;
  } => {
    return typeof trip === 'object' && trip !== null;
  };

  // Filter schedules based on search query and status
  const filteredSchedules = trips?.filter(schedule => {
    const matchesSearch = 
      searchQuery === "" || 
      (schedule.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (schedule.destination && schedule.destination.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (schedule.startLocation && schedule.startLocation.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || schedule.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Debug logging for filtered schedules
  console.log("Filtered schedules:", filteredSchedules);

  // Group schedules by status
  const upcomingSchedules = filteredSchedules?.filter(schedule => {
    if (!schedule.startDate) return false;
    try {
      const now = new Date();
      const startDate = new Date(schedule.startDate);
      const endDate = new Date(schedule.endDate);

      // Schedule has a current status that indicates it's upcoming or in progress
      const hasActiveStatus = schedule.status === "planning" || schedule.status === "confirmed" || schedule.status === "in-progress";
      
      // Schedule is not marked as cancelled or completed
      const isNotFinished = schedule.status !== "cancelled" && schedule.status !== "completed";
      
      // A schedule is "upcoming" if it is planning/confirmed regardless of start date
      // (The auto-update system will take care of changing status when start time is reached)
      const isUpcoming = (schedule.status === "planning" || schedule.status === "confirmed");
      
      // A schedule is "in progress" if it has that status regardless of start/end times
      // We used to check: schedule.status === "in-progress" && startDate <= now && endDate > now
      // But this was causing issues with schedules not showing up when they should
      const isActiveNow = schedule.status === "in-progress";
      
      // For debugging
      console.log(`Schedule ${schedule.id} (${schedule.name}): isUpcoming=${isUpcoming}, isActiveNow=${isActiveNow}, status=${schedule.status}`);
      
      return (isUpcoming || isActiveNow) && isNotFinished && hasActiveStatus;
    } catch (e) {
      console.error("Error parsing date:", schedule.startDate);
      return false;
    }
  });
  
  console.log("Upcoming schedules count:", upcomingSchedules?.length || 0);
  
  const pastSchedules = filteredSchedules?.filter(schedule => {
    if (!schedule.endDate) return false;
    try {
      const now = new Date();
      const endDate = new Date(schedule.endDate);
      
      // A schedule is considered "past" if it's completed (by status)
      // OR if its end date is in the past AND it's not cancelled
      const isCompleted = schedule.status === "completed";
      const isPastEndDate = endDate < now && schedule.status !== "cancelled";
      
      // Also mark in-progress schedules whose end date has passed as "past"
      const isOverdueInProgress = schedule.status === "in-progress" && endDate < now;
      
      // For debugging
      console.log(`Schedule ${schedule.id} (${schedule.name}): isCompleted=${isCompleted}, isPastEndDate=${isPastEndDate}, isOverdueInProgress=${isOverdueInProgress}`);
      
      return isCompleted || isPastEndDate || isOverdueInProgress;
    } catch (e) {
      console.error("Error parsing date:", schedule.endDate);
      return false;
    }
  });
  
  console.log("Past schedules:", pastSchedules);

  const cancelledSchedules = filteredSchedules?.filter(schedule => 
    schedule.status === "cancelled"
  );
  
  console.log("Cancelled schedules:", cancelledSchedules);

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
                console.log("Manually refreshing trips data");
                refetch();
              }}
              className="h-9 w-9 text-lg font-bold"
              title="Refresh trips"
            >
              ↻
            </Button>
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            <Button 
              onClick={() => navigate("/trips/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create New Trip
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
            {/* Expenses section removed */}

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingTrips && upcomingTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming schedules</h3>
                <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
                <Button 
                  onClick={() => navigate("/trips/new")}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pastTrips && pastTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : cancelledTrips && cancelledTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cancelledTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
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
