import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  // Debug logging for trips data
  console.log("Trips data from API:", trips);

  // Filter trips based on search query and status
  const filteredTrips = trips?.filter(trip => {
    const matchesSearch = 
      searchQuery === "" || 
      trip.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (trip.destination && trip.destination.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || trip.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Debug logging for filtered trips
  console.log("Filtered trips:", filteredTrips);

  // Group trips by status
  const upcomingTrips = filteredTrips?.filter(trip => {
    if (!trip.startDate) return false;
    try {
      // If it's a future trip or currently active trip, include it
      return (new Date(trip.startDate) > new Date() || trip.status === "in-progress") 
        && trip.status !== "cancelled" && trip.status !== "completed";
    } catch (e) {
      console.error("Error parsing date:", trip.startDate);
      return false;
    }
  });
  
  console.log("Upcoming trips:", upcomingTrips);
  
  const pastTrips = filteredTrips?.filter(trip => {
    if (!trip.endDate) return false;
    try {
      return new Date(trip.endDate) < new Date() || trip.status === "completed";
    } catch (e) {
      console.error("Error parsing date:", trip.endDate);
      return false;
    }
  });
  
  console.log("Past trips:", pastTrips);

  const cancelledTrips = filteredTrips?.filter(trip => 
    trip.status === "cancelled"
  );
  
  console.log("Cancelled trips:", cancelledTrips);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4 sm:mb-0">
            My Trips
          </h1>
          <Button 
            onClick={() => navigate("/trips/new")}
            className="inline-flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create New Trip
          </Button>
        </div>
        
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search trips by name or destination"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <Tabs defaultValue="upcoming" className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="upcoming" onClick={() => setStatusFilter("all")}>
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="past" onClick={() => setStatusFilter("all")}>
              Past
            </TabsTrigger>
            <TabsTrigger value="cancelled" onClick={() => setStatusFilter("cancelled")}>
              Cancelled
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upcoming">
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
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming trips</h3>
                <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
                <Button 
                  onClick={() => navigate("/trips/new")}
                  className="inline-flex items-center"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Trip
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="past">
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
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No past trips</h3>
                <p className="text-neutral-500">Your completed trips will appear here</p>
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
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No cancelled trips</h3>
                <p className="text-neutral-500">Cancelled trips will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
