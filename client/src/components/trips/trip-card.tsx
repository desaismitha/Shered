import React, { useState } from "react";
import { Calendar, Users, Edit, CheckSquare, FileText } from "lucide-react";
import { format } from "date-fns";
import { Trip as BaseTrip } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GroupMember, User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { RequestModificationDialog } from "./request-modification-dialog";

// Extend the Trip type to include the _accessLevel property
// Note: We're keeping the Trip interface name for compatibility with the rest of the codebase
// but conceptually this represents a Schedule
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member' | null;
}

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  // Debug output
  console.log("TripCard received trip data:", trip);
  
  const { user, isAdmin } = useAuth();
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
  
  // State for modification request dialog
  const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
  
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
    <>
      <div className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
        <div className="flex flex-row">
          {/* Left side - small image/gradient */}
          <div className="w-24 h-24 min-w-[6rem] overflow-hidden relative bg-primary-200">
            {trip.imageUrl ? (
              <img 
                src={trip.imageUrl} 
                alt={trip.destination || 'Trip destination'} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-primary-400 to-primary-600" />
            )}
          </div>
          
          {/* Right side - content */}
          <div className="flex-1 p-3">
            <div className="flex justify-between items-start">
              {/* Title and date */}
              <div>
                <h3 className="font-bold text-lg">{trip.name || 'Unnamed trip'}</h3>
                <div className="flex items-center text-sm text-neutral-600 mt-1">
                  <Calendar className="mr-1 h-4 w-4" />
                  <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                </div>
                
                {/* Locations */}
                <div className="text-xs text-neutral-500 mt-1">
                  {trip.startLocationDisplay || trip.startLocation || 'No start location'} → {trip.destinationDisplay || trip.destination || 'No destination'}
                </div>
              </div>
              
              {/* Status badge */}
              <Badge className={getStatusColor(trip.status)}>
                {trip.status ? (trip.status.charAt(0).toUpperCase() + trip.status.slice(1)) : 'Unknown'}
              </Badge>
            </div>
            
            {/* People and buttons row */}
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
                        title={user?.displayName || user?.username || "User"}
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
                          title={creator?.displayName || creator?.username || "Creator"}
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
              
              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Check-in button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = `/schedules/${trip.id}?tab=check-in`;
                    console.log("Check-in button clicked, navigating to:", url);
                    navigate(url);
                  }}
                >
                  <CheckSquare className="h-3 w-3" />
                  <span className="text-xs">Check-in</span>
                </Button>
                
                {/* View Details button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 text-primary-600 border-primary-200"
                  onClick={(e) => {
                    e.preventDefault();
                    const url = `/schedules/${trip.id}?tab=preview`;
                    console.log("View details clicked, navigating to:", url);
                    window.location.href = url;
                  }}
                >
                  <span className="text-xs font-medium">View Details</span>
                </Button>
                
                {/* Edit or Request Changes button */}
                {isAdmin() ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1 text-neutral-500 hover:text-primary-600"
                    onClick={(e) => {
                      e.preventDefault();
                      console.log("Edit button clicked, navigating to:", `/schedules/${trip.id}?tab=form`);
                      navigate(`/schedules/${trip.id}?tab=form`);
                    }}
                  >
                    <Edit className="h-3 w-3" />
                    <span className="text-xs">Edit</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsModifyDialogOpen(true);
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    <span className="text-xs">Request Changes</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Modification Request Dialog */}
      <RequestModificationDialog
        tripId={trip.id}
        tripName={trip.name}
        isOpen={isModifyDialogOpen}
        onClose={() => setIsModifyDialogOpen(false)}
      />
    </>
  );
}