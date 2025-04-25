import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { PlusIcon, NavigationIcon, MapPinIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function ActiveTripsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Query to fetch active trips
  const { data: activeTrips, isLoading, error } = useQuery<Trip[]>({
    queryKey: ["/api/trips/active"],
    enabled: !!user,
  });

  if (error) {
    toast({
      title: "Error fetching active trips",
      description: "There was a problem loading your active trips. Please try again.",
      variant: "destructive",
    });
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Active Trips
            </h1>
            <p className="text-neutral-500 mt-1">
              Monitor and track your in-progress trips
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

        {isLoading ? (
          // Loading skeleton
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="h-48 bg-neutral-100 relative">
                  <Skeleton className="w-full h-full" />
                </div>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : activeTrips && activeTrips.length > 0 ? (
          // Display active trips
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeTrips.map((trip) => (
              <Card key={trip.id} className="overflow-hidden h-full flex flex-col">
                <div className="h-48 bg-neutral-100 relative">
                  {trip.imageUrl ? (
                    <img 
                      src={trip.imageUrl} 
                      alt={trip.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary-50">
                      <MapPinIcon className="h-12 w-12 text-primary-200" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-primary-500">
                      In Progress
                    </Badge>
                  </div>
                </div>
                <CardHeader>
                  <CardTitle>{trip.name}</CardTitle>
                  <CardDescription>
                    {trip.destination || "No destination specified"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="text-sm text-neutral-600">
                    <p className="flex items-center">
                      <span className="font-medium mr-2">Dates:</span>
                      {formatDateRange(trip.startDate, trip.endDate)}
                    </p>
                    {trip.startLocation && (
                      <p className="flex items-center mt-2">
                        <span className="font-medium mr-2">From:</span>
                        <span className="text-neutral-800">{trip.startLocation}</span>
                      </p>
                    )}
                    {trip.destination && (
                      <p className="flex items-center mt-2">
                        <span className="font-medium mr-2">To:</span>
                        <span className="text-neutral-800">{trip.destination}</span>
                      </p>
                    )}
                    {trip.currentLatitude && trip.currentLongitude && (
                      <p className="flex items-center mt-2">
                        <span className="font-medium mr-2">Last Update:</span>
                        {trip.lastLocationUpdate ? new Date(trip.lastLocationUpdate).toLocaleString() : "Not updated yet"}
                      </p>
                    )}
                    {trip.distanceTraveled && trip.distanceTraveled > 0 && (
                      <p className="flex items-center mt-2">
                        <span className="font-medium mr-2">Distance:</span>
                        {trip.distanceTraveled.toFixed(1)} km
                      </p>
                    )}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/trips/${trip.id}?tab=tracking`)}
                    className="w-full inline-flex items-center justify-center"
                  >
                    <NavigationIcon className="h-4 w-4 mr-2" />
                    View &amp; Track Trip
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          // No active trips
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <NavigationIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">No active trips</h3>
            <p className="text-neutral-500 mb-6">
              You don't have any in-progress trips at the moment.
            </p>
            <Button 
              onClick={() => navigate("/trips")}
              className="inline-flex items-center"
            >
              View All Trips
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}