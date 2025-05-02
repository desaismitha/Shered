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
import { CheckCircle, XCircle, Clock, AlertTriangle, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

interface TripCheckInProps {
  tripId: number;
  accessLevel?: 'owner' | 'member';
  groupMembers?: CheckInUser[];
}

export function TripCheckIn({ tripId, accessLevel = 'member', groupMembers = [] }: TripCheckInProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('ready');

  // Get all check-in status for the trip
  const { data: checkInStatuses, isLoading: isLoadingStatuses } = useQuery<CheckInStatus[]>({
    queryKey: [`/api/trips/${tripId}/check-in-status`],
    enabled: !!tripId && (accessLevel === 'owner' || accessLevel === 'member')
  });

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
    onSuccess: () => {
      toast({
        title: 'Check-in updated',
        description: 'Your check-in status has been updated successfully.',
      });
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
          {/* Current user's check-in form */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Your Status</h3>

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
              {checkInMutation.isPending ? 'Updating...' : 'Update My Status'}
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
                  checkInStatuses.map(checkInStatus => {
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