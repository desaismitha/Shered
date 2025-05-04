import { Calendar, Users, Edit, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { Trip as BaseTrip } from "@shared/schema";

// Extend the Trip type to include the _accessLevel property
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member' | null;
}
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GroupMember, User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  // Debug output
  console.log("TripCard received trip data:", trip);
  
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  // Get group members to display avatars - only fetch if groupId is not null
  const { data: groupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", trip.groupId, "members"],
    enabled: !!trip.groupId, // Only run this query if there is a groupId
  });

  // Get users for member details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: true, // Always fetch users so we can display the creator at minimum
  });
  
  // Check if user is the creator or admin - use the _accessLevel now
  // Use the _accessLevel from API response or fall back to direct ID comparison
  const isCreator = trip._accessLevel === 'owner' || user?.id === trip.createdBy;
  
  // Log access level for debugging
  console.log("Trip access level:", trip._accessLevel);
  
  const formatDateRange = (startDate: Date | string | null, endDate: Date | string | null) => {
    // Handle missing or invalid dates
    if (!startDate || !endDate) {
      return "Date not specified";
    }
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if dates are valid
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return "Invalid date";
      }
      
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
      }
      
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
      }
      
      return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
    } catch (error) {
      console.error("Error formatting date range:", error);
      return "Invalid date format";
    }
  };
  
  // Get status badge color
  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return 'bg-neutral-100 text-neutral-800';
    
    switch (status.toLowerCase()) {
      case 'planning':
        return 'bg-orange-100 text-orange-800';
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-800';
      case 'upcoming':
        return 'bg-primary-100 text-primary-800';
      case 'completed':
        return 'bg-neutral-100 text-neutral-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-48 w-full overflow-hidden relative bg-primary-200">
        {trip.imageUrl ? (
          <img 
            src={trip.imageUrl} 
            alt={trip.destination || 'Trip destination'} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-primary-400 to-primary-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end">
          <div className="p-4 text-white">
            <h3 className="font-bold text-lg">{trip.destination || 'Unnamed destination'}</h3>
            <div className="flex items-center mt-1">
              <Calendar className="mr-1 h-4 w-4" />
              <span className="text-sm">
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500">
            <Users className="inline-block mr-1 h-4 w-4" />
            {trip.name || 'Unnamed trip'} 
            {trip.groupId ? 
              `(${groupMembers?.length || 0} members)` : 
              "(Personal Trip)"
            }
          </div>
          <Badge className={getStatusColor(trip.status)}>
            {trip.status ? (trip.status.charAt(0).toUpperCase() + trip.status.slice(1)) : 'Unknown'}
          </Badge>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex -space-x-2">
            {trip.groupId && groupMembers && users ? (
              // Group trip with members
              groupMembers.slice(0, 4).map((member, index) => {
                const user = users.find(u => u.id === member.userId);
                return (
                  <div 
                    key={member.id}
                    className="w-7 h-7 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                  >
                    {user?.displayName?.[0] || user?.username?.[0] || "U"}
                  </div>
                );
              })
            ) : (
              // Personal trip or loading state
              users ? (
                // Find the creator user
                (() => {
                  const creator = users.find(u => u.id === trip.createdBy);
                  return (
                    <div 
                      key="creator"
                      className="w-7 h-7 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                    >
                      {creator?.displayName?.[0] || creator?.username?.[0] || "U"}
                    </div>
                  );
                })()
              ) : (
                // Loading state
                <div 
                  key="loading"
                  className="w-7 h-7 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                />
              )
            )}
            {trip.groupId && groupMembers && groupMembers.length > 4 && (
              <div className="w-7 h-7 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs text-neutral-600">
                +{groupMembers.length - 4}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* Check-in button */}
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-green-600 hover:text-green-700"
              onClick={() => {
                console.log("Check-in button clicked, navigating to:", `/trips/${trip.id}?tab=check-in`);
                navigate(`/trips/${trip.id}?tab=check-in`);
              }}
            >
              <CheckSquare className="h-3 w-3" />
              <span className="text-xs">Check-in</span>
            </Button>
            
            {isCreator && (
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 text-neutral-500 hover:text-primary-600"
                onClick={() => {
                  console.log("Edit button clicked, navigating to:", `/trips/${trip.id}?edit=true`);
                  navigate(`/trips/${trip.id}?edit=true`);
                }}
              >
                <Edit className="h-3 w-3" />
                <span className="text-xs">Edit</span>
              </Button>
            )}
            
            <Link 
              href={`/trips/${trip.id}`}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}