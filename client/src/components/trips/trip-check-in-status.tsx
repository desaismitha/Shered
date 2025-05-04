import * as React from 'react';
import { Trip, GroupMember } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, AlertTriangle, UserCheck, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TripCheckIn as TripCheckInType } from '@shared/schema';

interface CheckInUser {
  id: number;
  userId: number;
  username: string;
  displayName: string;
}

interface CheckInStatus {
  userId: number;
  status: string;
}

interface TripCheckInStatusProps {
  tripId: number;
  accessLevel?: 'owner' | 'member';
  groupMembers?: CheckInUser[];
  tripStatus?: string;
}

export function TripCheckInStatus({ tripId, accessLevel = 'member', groupMembers = [], tripStatus = 'planning' }: TripCheckInStatusProps) {
  const { user } = useAuth();

  // Get trip data to check if it has a group
  const { data: tripData } = useQuery<Trip>({
    queryKey: [`/api/trips/${tripId}`],
    enabled: !!tripId
  });
  
  // Get all check-in status for the trip
  const { data: checkInStatuses, isLoading: isLoadingStatuses } = useQuery<CheckInStatus[]>({
    queryKey: [`/api/trips/${tripId}/check-in-status`],
    enabled: !!tripId && (accessLevel === 'owner' || accessLevel === 'member')
  });

  // Get current user's check-in
  const { data: myCheckIn, isLoading: isLoadingMyCheckIn } = useQuery<TripCheckInType>({
    queryKey: [`/api/trips/${tripId}/check-ins/user/${user?.id}`],
    enabled: !!tripId && !!user?.id,
    refetchOnWindowFocus: false,
  });

  // Get status badge and icon
  const getStatusBadge = (checkInStatus: string) => {
    switch (checkInStatus) {
      case 'ready':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200" variant="outline">
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            Ready
          </Badge>
        );
      case 'not-ready':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200" variant="outline">
            <XCircle className="w-3.5 h-3.5 mr-1" />
            Not Ready
          </Badge>
        );
      case 'delayed':
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200" variant="outline">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Delayed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200" variant="outline">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Unknown
          </Badge>
        );
    }
  };

  // Get user display name from ID
  const getUserDisplayName = (userId: number) => {
    const member = groupMembers.find(member => member.userId === userId);
    return member?.displayName || `User ${userId}`;
  };

  // If user is not authenticated, don't show component
  if (!user) return null;

  // Generate a complete list of member statuses, including those who haven't checked in yet
  const allMemberStatuses = React.useMemo(() => {
    if (!groupMembers || groupMembers.length === 0) return [];
    
    // Create a map of existing check-in statuses by userId
    const statusMap = new Map();
    if (checkInStatuses) {
      checkInStatuses.forEach(status => {
        statusMap.set(status.userId, status);
      });
    }
    
    // Create a combined list with all group members
    return groupMembers.map(member => {
      const existingStatus = statusMap.get(member.userId);
      return existingStatus || {
        userId: member.userId,
        status: 'not-checked-in'
      };
    });
  }, [groupMembers, checkInStatuses]);
  
  // Check if all members are ready
  const allMembersReady = groupMembers.length > 0 && 
    checkInStatuses && 
    checkInStatuses.length === groupMembers.length && 
    checkInStatuses.every(checkIn => checkIn.status === 'ready');
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <UserCheck className="mr-2 h-5 w-5" />
              Member Check-In Status
            </CardTitle>
            <CardDescription>
              Current status of all members for this trip
            </CardDescription>
          </div>

          {allMembersReady && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
              All Ready!
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Status update notification */}
          {allMembersReady && tripStatus === 'planning' && (
            <Alert className="bg-green-50 border-green-200 mb-4">
              <AlertCircle className="h-5 w-5 text-green-600" />
              <AlertTitle className="text-green-800">Trip status will be updated</AlertTitle>
              <AlertDescription className="text-green-700">
                All members are ready! The trip status will be automatically updated to "Confirmed".
              </AlertDescription>
            </Alert>
          )}
          
          {allMembersReady && tripStatus === 'confirmed' && (
            <Alert className="bg-green-50 border-green-200 mb-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <AlertTitle className="text-green-800">Trip confirmed!</AlertTitle>
              <AlertDescription className="text-green-700">
                This trip has been confirmed and is ready to go.
              </AlertDescription>
            </Alert>
          )}

          {/* Your check-in status */}
          {myCheckIn && (
            <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-blue-800">Your Status</h3>
                {getStatusBadge(myCheckIn.status || 'unknown')}
              </div>
              {myCheckIn.checkedInAt && (
                <p className="text-xs text-blue-700">
                  Checked in on {format(new Date(myCheckIn.checkedInAt), 'PPP pp')}
                </p>
              )}
              {myCheckIn.notes && (
                <p className="text-xs text-blue-700 mt-1 italic">
                  Notes: {myCheckIn.notes}
                </p>
              )}
            </div>
          )}

          {/* All members statuses */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">All Members</h3>
            <div className="space-y-2">
              {isLoadingStatuses ? (
                <div className="text-sm text-muted-foreground">Loading statuses...</div>
              ) : groupMembers && groupMembers.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {/* Show all members with their check-in status */}
                  {allMemberStatuses.map(status => {
                    const isCurrentUser = user && status.userId === user.id;
                    return (
                      <div 
                        key={status.userId}
                        className={cn(
                          "flex justify-between items-center p-3 rounded-md",
                          isCurrentUser ? "bg-muted/50" : "bg-card", 
                          status.status === 'ready' ? "border-l-4 border-l-green-500" : 
                          status.status === 'not-ready' ? "border-l-4 border-l-red-500" : 
                          status.status === 'delayed' ? "border-l-4 border-l-amber-500" : 
                          status.status === 'not-checked-in' ? "border-l-4 border-l-gray-400" :
                          "border"
                        )}
                      >
                        <div className="flex items-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-sm mr-2">
                                  {getUserDisplayName(status.userId)}
                                  {isCurrentUser && " (You)"}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>User ID: {status.userId}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {status.status === 'not-checked-in' ? (
                          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200" variant="outline">
                            <AlertCircle className="w-3.5 h-3.5 mr-1" />
                            Not Checked In
                          </Badge>
                        ) : (
                          getStatusBadge(status.status)
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                  {tripData?.groupId ? 
                    "No check-ins recorded yet. Members need to check in for this trip." :
                    "This trip doesn't have any group members. Create a group or add this trip to an existing group to enable member check-ins."}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}