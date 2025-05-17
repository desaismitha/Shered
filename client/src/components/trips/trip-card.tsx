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

// Extend the Trip type to include the _accessLevel property and location display properties
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member' | null;
  startLocationDisplay?: string;
  destinationDisplay?: string;
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
      <div className="bg-white border-b hover:bg-gray-50 transition-colors py-3 w-full">
        <div className="flex flex-wrap items-start px-3">
          {/* Left side with status and name */}
          <div className="flex items-start flex-grow mr-2 min-w-[150px]">
            {/* Status indicator dot */}
            <div className={`h-3 w-3 rounded-full flex-shrink-0 mt-1.5 ${
              trip.status === 'in-progress' ? 'bg-green-500' : 
              trip.status === 'confirmed' ? 'bg-blue-500' :
              trip.status === 'planning' ? 'bg-orange-500' :
              trip.status === 'completed' ? 'bg-gray-400' :
              'bg-gray-300'
            }`} title={trip.status || 'Unknown'} />

            {/* Schedule name in its own container with more space */}
            <div className="ml-3 flex flex-col min-h-[2.5rem] justify-center flex-grow">
              <h3 
                className="font-medium text-sm cursor-pointer hover:text-primary-600 transition-colors"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  lineHeight: '1.3'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = `/schedules/${trip.id}?tab=preview`;
                }}
              >
                {trip.name || 'Unnamed schedule'}
              </h3>
            </div>
          </div>
          
          {/* Right side with all the metadata */}
          <div className="flex items-center ml-auto">
            {/* Date/time info */}
            <div className="flex flex-col mr-3">
              <span className="text-xs text-gray-500 flex-shrink-0">
                <Calendar className="inline-block mr-1 h-3 w-3" />
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>

              {/* Quick summary (From → To) */}
              <div className="flex-1 text-xs text-gray-500 truncate overflow-hidden mt-1 max-w-[180px]">
                <span className="truncate">
                  {trip.startLocationDisplay?.split('[')[0] || trip.startLocation?.split('[')[0] || 'Start'} 
                  <span className="mx-1">→</span> 
                  {trip.destinationDisplay?.split('[')[0] || trip.destination?.split('[')[0] || 'End'}
                </span>
              </div>
            </div>

            {/* Participants (up to 2) */}
            <div className="flex -space-x-1 mr-3 flex-shrink-0">
              {trip.groupId && groupMembers && users ? (
                // Group trip with members - show only 2
                groupMembers.slice(0, 2).map((member, index) => {
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
              {trip.groupId && groupMembers && groupMembers.length > 2 && (
                <div className="w-6 h-6 rounded-full bg-neutral-200 border border-white flex items-center justify-center text-xs text-neutral-600">
                  +{groupMembers.length - 2}
                </div>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center space-x-1 flex-shrink-0">
              {/* Check-in */}
              <Button
                variant="ghost"
                size="sm"
                className="flex h-7 items-center text-green-600 hover:text-green-700"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = `/schedules/${trip.id}?tab=check-in`;
                }}
              >
                <CheckSquare className="h-3 w-3" />
              </Button>
              
              {/* Edit or Request Changes */}
              {isAdmin() ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex h-7 items-center text-neutral-500 hover:text-primary-600"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/schedules/${trip.id}?tab=form`;
                  }}
                >
                  <Edit className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex h-7 items-center text-blue-600 hover:text-blue-700"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsModifyDialogOpen(true);
                  }}
                >
                  <FileText className="h-3 w-3" />
                </Button>
              )}
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