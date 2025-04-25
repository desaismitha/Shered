import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { Link } from "wouter";
import { TripCard } from "@/components/trips/trip-card";
import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingTrips() {
  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Filter to only show upcoming trips (future start date)
  const upcomingTrips = trips?.filter(trip => 
    new Date(trip.startDate) > new Date()
  ).slice(0, 3);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Upcoming Trips</h2>
        <Link href="/trips" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          View all
        </Link>
      </div>
      
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcomingTrips && upcomingTrips.length > 0 ? (
            upcomingTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))
          ) : (
            <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
              <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming trips</h3>
              <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
              <Link 
                href="/trips/new" 
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
              >
                Create New Trip
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
