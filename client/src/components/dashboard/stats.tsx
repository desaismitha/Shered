import { Calendar, Users } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trip, Group } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface Stat {
  title: string;
  value: string | number;
  icon: typeof Calendar;
  iconBgColor: string;
  iconColor: string;
  href: string;
  linkText: string;
  isLoading?: boolean;
}

export function DashboardStats() {
  // Fetch trips data
  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Fetch groups data
  const { data: groups, isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Expenses and messages removed

  // Calculate trips count - include both upcoming and in-progress trips
  const activeTrips = !tripsLoading && trips
    ? trips.filter(trip => 
        // Include upcoming trips (future start date)
        new Date(trip.startDate) > new Date() || 
        // Include in-progress trips
        trip.status === 'in-progress')
    : [];
  
  // Use the actual count of active trips (upcoming + in-progress)
  const upcomingTripsCount = activeTrips.length;
  
  // For debugging
  console.log("Active trips (upcoming + in-progress):", activeTrips);
  
  // For debugging
  console.log("All trips:", trips);
  console.log("Upcoming trips count:", upcomingTripsCount);

  // Calculate active groups count
  const activeGroupsCount = !groupsLoading && groups ? groups.length : 0;

  // User information for profile display
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
    staleTime: 1000 * 60, // 1 minute
  });

  const stats: Stat[] = [
    {
      title: "Active Trips",
      value: tripsLoading ? "..." : upcomingTripsCount,
      icon: Calendar,
      iconBgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      href: "/trips",
      linkText: "View all trips",
      isLoading: tripsLoading
    },
    {
      title: "Active Groups",
      value: groupsLoading ? "..." : activeGroupsCount,
      icon: Users,
      iconBgColor: "bg-orange-100",
      iconColor: "text-orange-600",
      href: "/groups",
      linkText: "View all groups",
      isLoading: groupsLoading
    }
  ];
  
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className={`flex-shrink-0 ${stat.iconBgColor} rounded-md p-3`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-neutral-500 truncate">{stat.title}</dt>
                  <dd>
                    {stat.isLoading ? (
                      <Skeleton className="h-6 w-16" />
                    ) : (
                      <div className="text-lg font-medium text-neutral-900">{stat.value}</div>
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-neutral-50 px-4 py-3 border-t border-neutral-200 text-sm">
            <Link href={stat.href} className="font-medium text-primary-600 hover:text-primary-500">
              {stat.linkText}
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
