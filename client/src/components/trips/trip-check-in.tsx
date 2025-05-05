import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { TripCheckIn as TripCheckInType } from '@shared/schema';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Clock, AlertTriangle, UserCheck, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface CheckInUser {
  id: number;
  username: string;
  displayName: string;
}

interface CheckInStatus {
  userId: number;
  status: string;
}

interface CheckInResponse {
  checkInStatuses: CheckInStatus[];
  tripInfo: {
    startLocation: string | null;
    startLocationDisplay: string | null;
    destination: string | null;
    destinationDisplay: string | null;
  };
}

interface TripCheckInProps {
  tripId: number;
  accessLevel?: 'owner' | 'member';
  groupMembers?: CheckInUser[];
  tripStatus?: string;
}

export function TripCheckIn({ tripId, accessLevel = 'member', groupMembers = [], tripStatus = 'planning' }: TripCheckInProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('ready');
  const [isAlreadyCheckedIn, setIsAlreadyCheckedIn] = useState(false);

  // Get all check-in status for the trip
  const { data: checkInResponse, isLoading: isLoadingStatuses } = useQuery<CheckInResponse>({
    queryKey: [`/api/trips/${tripId}/check-in-status`],
    enabled: !!tripId && (accessLevel === 'owner' || accessLevel === 'member')
  });
  
  // Extract check-in statuses and location info from the response
  const checkInStatuses = checkInResponse?.checkInStatuses;
  const locationInfo = checkInResponse?.tripInfo;
  
  // Log the check-in response when it's loaded
  useEffect(() => {
    if (checkInResponse) {
      console.log('Check-in response data:', checkInResponse);
      console.log('Location info:', locationInfo);
    }
  }, [checkInResponse, locationInfo]);

  // Get current user's check-in
  const { data: myCheckIn, isLoading: isLoadingMyCheckIn } = useQuery<TripCheckInType>({
    queryKey: [`/api/trips/${tripId}/check-ins/user/${user?.id}`],
    enabled: !!tripId && !!user?.id,
    // Use the onSuccess callback from the component to update state
    refetchOnWindowFocus: false,
  });
  
  // Update status and notes when myCheckIn data changes
  useEffect(() => {
    if (myCheckIn) {
      setStatus(myCheckIn.status || 'ready');
      setNotes(myCheckIn.notes || '');
      setIsAlreadyCheckedIn(true);
      console.log('User already checked in with status:', myCheckIn.status);
    } else {
      setIsAlreadyCheckedIn(false);
    }
  }, [myCheckIn]);

  // Create or update check-in
  const checkInMutation = useMutation({
    mutationFn: async (checkInData: { status: string; notes?: string }) => {
      const res = await apiRequest(
        'POST',
        `/api/trips/${tripId}/check-ins`,
        checkInData
      );
      return res.json();
    },
    onSuccess: (data) => {
      // Set the isAlreadyCheckedIn state to true
      setIsAlreadyCheckedIn(true);
      
      // If the response indicates all members are ready, show a special toast
      if (data.allReady && tripStatus === 'planning') {
        toast({
          title: 'Trip status updated!',
          description: 'All members are ready! Trip status changed to Confirmed.',
          variant: 'default',
        });
        
        // Invalidate the trip query to update the trip status
        queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      } else {
        toast({
          title: 'Check-in updated',
          description: 'Your check-in status has been updated successfully.',
        });
      }
      
      // Invalidate both queries to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/check-in-status`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/check-ins/user/${user?.id}`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating check-in',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Handle submitting check-in
  const handleCheckIn = () => {
    if (!user) return;
    
    checkInMutation.mutate({
      status,
      notes: notes
    });
  };

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
    const member = groupMembers.find(member => member.id === userId);
    return member?.displayName || `User ${userId}`;
  };

  // If user is not authenticated or not a member, don't show component
  if (!user) return null;

  // Check if all members are ready
  const allMembersReady = groupMembers.length > 0 && 
    checkInStatuses && 
    checkInStatuses.length === groupMembers.length && 
    checkInStatuses.every(checkIn => checkIn.status === 'ready');

  // Invalidate trip query when all members are ready to refresh trip status
  useEffect(() => {
    if (allMembersReady && tripStatus === 'planning') {
      // Invalidate trip query to refresh trip status
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
    }
  }, [allMembersReady, tripStatus, tripId, queryClient]);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <UserCheck className="mr-2 h-5 w-5" />
              Check-In Status
            </CardTitle>
            <CardDescription>
              Confirm your readiness for this trip
            </CardDescription>
            {locationInfo && (
              <div className="mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" />
                  <span className="font-medium">From:</span> {locationInfo.startLocationDisplay || 'Unknown location'}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="font-medium">To:</span> {locationInfo.destinationDisplay || 'Unknown location'}
                </div>
              </div>
            )}
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
          {/* Current user's check-in form */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium">Your Status</h3>
              {isAlreadyCheckedIn && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200" variant="outline">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Already Checked In
                </Badge>
              )}
            </div>
            
            {isAlreadyCheckedIn && (
              <Alert className="bg-blue-50 border-blue-200 mb-4">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <AlertTitle className="text-blue-800">You're checked in as: {getStatusBadge(status)}</AlertTitle>
                <AlertDescription className="text-blue-700">
                  {myCheckIn?.checkedInAt && (
                    <span>Checked in on {format(new Date(myCheckIn.checkedInAt), 'PPP pp')}</span>
                  )}
                  {notes && <p className="mt-2 italic">Notes: {notes}</p>}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="status">Are you ready for this trip?</Label>
                <Select
                  value={status}
                  onValueChange={setStatus}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select your status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ready">I'm Ready</SelectItem>
                    <SelectItem value="not-ready">Not Ready Yet</SelectItem>
                    <SelectItem value="delayed">I'll Be Delayed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add any notes about your status here"
                  className="h-20"
                />
              </div>
            </div>
            
            <Button
              onClick={handleCheckIn}
              disabled={checkInMutation.isPending}
              className="mt-2 w-full"
            >
              {checkInMutation.isPending ? 'Updating...' : isAlreadyCheckedIn ? 'Update My Status' : 'Check In'}
            </Button>
          </div>

          {/* Group members statuses */}
          {accessLevel === 'owner' && groupMembers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Group Status</h3>
              <div className="space-y-2">
                {isLoadingStatuses ? (
                  <div className="text-sm text-muted-foreground">Loading statuses...</div>
                ) : checkInStatuses && checkInStatuses.length > 0 ? (
                  /* De-duplicate members by creating a map using userId as key */
                  Array.from(new Map(checkInStatuses.map(item => [item.userId, item])).values()).map(checkInStatus => {
                    const isCurrentUser = user && checkInStatus.userId === user.id;
                    return (
                      <div 
                        key={checkInStatus.userId}
                        className={cn(
                          "flex justify-between items-center p-3 rounded-md",
                          isCurrentUser ? "bg-muted/50" : "bg-card"
                        )}
                      >
                        <div className="flex items-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-sm mr-2">
                                  {getUserDisplayName(checkInStatus.userId)}
                                  {isCurrentUser && " (You)"}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>User ID: {checkInStatus.userId}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {getStatusBadge(checkInStatus.status)}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No check-ins recorded yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}