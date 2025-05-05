import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip as BaseTripType } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { useEffect } from "react";

type Trip = BaseTripType & {
  startLocationDisplay?: string;
  destinationDisplay?: string;
  _accessLevel?: 'owner' | 'member' | null;
};

export default function TripsDebugPage() {
  // Query to fetch all trips
  const { data: allTrips, isLoading: isLoadingAll } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    staleTime: 0,
  });

  // Query to fetch active trips
  const { data: activeTrips, isLoading: isLoadingActive } = useQuery<Trip[]>({
    queryKey: ["/api/trips/active"],
    staleTime: 0,
  });

  useEffect(() => {
    console.log("All trips from API:", allTrips);
    console.log("Active trips from API:", activeTrips);
  }, [allTrips, activeTrips]);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-bold mb-4">Trips Debug Page</h1>
        
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">All Trips from API ({allTrips?.length || 0})</h2>
          {isLoadingAll ? (
            <p>Loading all trips...</p>
          ) : (
            <div className="space-y-4">
              {allTrips?.map(trip => (
                <Card key={trip.id} className="p-4">
                  <p><strong>ID:</strong> {trip.id}</p>
                  <p><strong>Name:</strong> {trip.name}</p>
                  <p><strong>Status:</strong> {trip.status}</p>
                  <p><strong>Start Date:</strong> {new Date(trip.startDate).toLocaleString()}</p>
                  <p><strong>End Date:</strong> {new Date(trip.endDate).toLocaleString()}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">Active Trips from API ({activeTrips?.length || 0})</h2>
          {isLoadingActive ? (
            <p>Loading active trips...</p>
          ) : (
            <div className="space-y-4">
              {activeTrips?.map(trip => (
                <Card key={trip.id} className="p-4">
                  <p><strong>ID:</strong> {trip.id}</p>
                  <p><strong>Name:</strong> {trip.name}</p>
                  <p><strong>Status:</strong> {trip.status}</p>
                  <p><strong>Start Date:</strong> {new Date(trip.startDate).toLocaleString()}</p>
                  <p><strong>End Date:</strong> {new Date(trip.endDate).toLocaleString()}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
