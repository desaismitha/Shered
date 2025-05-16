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
      <div className="bg-white border-b hover:bg-gray-50 transition-colors py-2">
        <div className="flex items-center px-3">
          {/* Status indicator dot */}
          <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
            trip.status === 'in-progress' ? 'bg-green-500' : 
            trip.status === 'confirmed' ? 'bg-blue-500' :
            trip.status === 'planning' ? 'bg-orange-500' :
            trip.status === 'completed' ? 'bg-gray-400' :
            'bg-gray-300'
          }`} title={trip.status || 'Unknown'} />

          {/* Schedule name and time */}
          <div className="ml-3 flex-grow">
            <div className="flex items-center">
              <h3 className="font-medium text-sm">{trip.name || 'Unnamed schedule'}</h3>
              <span className="mx-2 text-gray-400 text-xs">•</span>
              <span className="text-xs text-gray-500">
                <Calendar className="inline-block mr-1 h-3 w-3" />
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>
            </div>
            
            {/* Locations as subtitle */}
            <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
              {trip.startLocationDisplay || trip.startLocation || 'No start location'} 
              <span className="mx-1">→</span> 
              {trip.destinationDisplay || trip.destination || 'No destination'}
            </div>
          </div>

          {/* Participants */}
          <div className="flex -space-x-1 mr-3">
            {trip.groupId && groupMembers && users ? (
              // Group trip with members
              groupMembers.slice(0, 3).map((member, index) => {
                const user = users.find(u => u.id === member.userId);
                return (
                  <div 
                    key={member.id}
                    className="w-6 h-6 rounded-full bg-neutral-300 border border-white flex items-center justify-center text-xs text-neutral-600"
                    title={user?.displayName || user?.username || "User"}
                  >
                    {user?.displayName?.[0] || user?.username?.[0] || "U"}
                  </div>
                );
              })
            ) : (
              users ? (
                (() => {
                  const creator = users.find(u => u.id === trip.createdBy);
                  return (
                    <div 
                      key="creator"
                      className="w-6 h-6 rounded-full bg-neutral-300 border border-white flex items-center justify-center text-xs text-neutral-600"
                      title={creator?.displayName || creator?.username || "Creator"}
                    >
                      {creator?.displayName?.[0] || creator?.username?.[0] || "U"}
                    </div>
                  );
                })()
              ) : (
                <div key="loading" className="w-6 h-6 rounded-full bg-neutral-300 border border-white" />
              )
            )}
            {trip.groupId && groupMembers && groupMembers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-neutral-200 border border-white flex items-center justify-center text-xs text-neutral-600">
                +{groupMembers.length - 3}
              </div>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center space-x-1">
            {/* Check-in button */}
            <Button
              variant="ghost"
              size="xs"
              className="flex h-7 items-center gap-1 text-green-600 hover:text-green-700"
              onClick={(e) => {
                e.preventDefault();
                const url = `/schedules/${trip.id}?tab=check-in`;
                console.log("Check-in button clicked, navigating to:", url);
                window.location.href = url;
              }}
            >
              <CheckSquare className="h-3 w-3" />
              <span className="text-xs">Check-in</span>
            </Button>
            
            {/* View Details button */}
            <Button
              variant="outline"
              size="xs"
              className="flex h-7 items-center gap-1 text-primary-600 border-primary-200"
              onClick={(e) => {
                e.preventDefault();
                const url = `/schedules/${trip.id}?tab=preview`;
                console.log("View details clicked, navigating to:", url);
                window.location.href = url;
              }}
            >
              <span className="text-xs font-medium">Details</span>
            </Button>
            
            {/* Edit or Request Changes button */}
            {isAdmin() ? (
              <Button
                variant="ghost"
                size="xs"
                className="flex h-7 items-center gap-1 text-neutral-500 hover:text-primary-600"
                onClick={(e) => {
                  e.preventDefault();
                  console.log("Edit button clicked, navigating to:", `/schedules/${trip.id}?tab=form`);
                  window.location.href = `/schedules/${trip.id}?tab=form`;
                }}
              >
                <Edit className="h-3 w-3" />
                <span className="text-xs">Edit</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className="flex h-7 items-center gap-1 text-blue-600 hover:text-blue-700"
                onClick={(e) => {
                  e.preventDefault();
                  setIsModifyDialogOpen(true);
                }}
              >
                <FileText className="h-3 w-3" />
                <span className="text-xs">Request</span>
              </Button>
            )}
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