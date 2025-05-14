import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Define interface for the Trip data structure
interface Trip {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  startLocation: string;
  destination: string;
  status: string;
  groupId: number | null;
  startLocationDisplay?: string;
  destinationDisplay?: string;
}

interface CheckInFormData {
  status: "ready" | "not-ready" | "maybe";
  notes: string;
}

interface CheckIn {
  id: number;
  tripId: number;
  userId: number;
  checkedInAt: string;
  status: string;
  notes: string;
}

interface CheckInStatus {
  userId: number;
  status: string;
}

interface CheckInStatusData {
  checkInStatuses: CheckInStatus[];
  tripInfo: {
    startLocation: string;
    startLocationDisplay?: string;
    destination: string;
    destinationDisplay?: string;
  };
}

function CheckInPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CheckInFormData>({
    status: "ready",
    notes: "",
  });
  const [showPastTrips, setShowPastTrips] = useState(false);
  
  // Fetch all trips the user is part of
  const {
    data: trips = [],
    isLoading: isLoadingTrips,
    error: tripsError,
  } = useQuery<Trip[]>({
    queryKey: ["/api/trips/user"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Filter trips based on showPastTrips toggle
  const filteredTrips = trips.filter(trip => {
    if (showPastTrips) return true;
    return ["planning", "confirmed", "in-progress"].includes(trip.status);
  });
  
  // Fetch user's check-in status for the selected trip
  const {
    data: userCheckIn,
    isLoading: isLoadingUserCheckIn,
  } = useQuery<CheckIn>({
    queryKey: ["/api/trips", selectedTripId, "check-ins/user", user?.id],
    enabled: !!selectedTripId && !!user?.id,
  });
  
  // Fetch all check-in statuses for the selected trip
  const {
    data: checkInStatus,
    isLoading: isLoadingCheckInStatus,
  } = useQuery<CheckInStatusData>({
    queryKey: ["/api/trips", selectedTripId, "check-in-status"],
    enabled: !!selectedTripId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  
  // Initialize form data when user check-in status is loaded
  useEffect(() => {
    if (userCheckIn) {
      setFormData({
        status: (userCheckIn.status as "ready" | "not-ready" | "maybe") || "ready",
        notes: userCheckIn.notes || "",
      });
    } else {
      // Reset form if no check-in exists
      setFormData({
        status: "ready",
        notes: "",
      });
    }
  }, [userCheckIn]);
  
  // Mutation for creating/updating check-in
  const checkInMutation = useMutation({
    mutationFn: async (data: CheckInFormData) => {
      if (!selectedTripId) throw new Error("No trip selected");
      
      const response = await apiRequest(
        "POST",
        `/api/trips/${selectedTripId}/check-ins`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Check-in successful",
        description: "Your check-in status has been updated.",
      });
      
      // Invalidate the queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ["/api/trips", selectedTripId, "check-ins/user", user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/trips", selectedTripId, "check-in-status"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Check-in failed",
        description: error.message || "An error occurred while checking in.",
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkInMutation.mutate(formData);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "text-green-500";
      case "not-ready":
        return "text-red-500";
      case "maybe":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "not-ready":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "maybe":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "ready":
        return "Ready";
      case "not-ready":
        return "Not Ready";
      case "maybe":
        return "Maybe";
      default:
        return "Unknown";
    }
  };
  
  return (
    <AppShell>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">Trip Check-in</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trip Selector */}
          <div className="lg:col-span-1">
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">Select a Trip</h2>
              
              <div className="mb-4 flex items-center space-x-2">
                <Switch 
                  id="show-past-trips"
                  checked={showPastTrips}
                  onCheckedChange={setShowPastTrips}
                />
                <Label htmlFor="show-past-trips">Show past trips</Label>
              </div>
              
              {isLoadingTrips ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : tripsError ? (
                <div className="text-red-500 p-4 border border-red-200 rounded-md">
                  Failed to load trips. Please try again.
                </div>
              ) : filteredTrips.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No trips found. Create a trip first.
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {filteredTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className={cn(
                        "p-3 border rounded-md cursor-pointer transition-colors",
                        selectedTripId === trip.id
                          ? "border-primary bg-primary-50"
                          : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                      )}
                      onClick={() => setSelectedTripId(trip.id)}
                    >
                      <div className="font-medium">{trip.name}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        From: {trip.startLocationDisplay || trip.startLocation.split("[")[0]}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        To: {trip.destinationDisplay || trip.destination.split("[")[0]}
                      </div>
                      <div className="flex items-center mt-2">
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 text-xs font-medium rounded-full",
                          trip.status === "planning" ? "bg-gray-100 text-gray-800" :
                          trip.status === "confirmed" ? "bg-blue-100 text-blue-800" :
                          trip.status === "in-progress" ? "bg-green-100 text-green-800" :
                          trip.status === "completed" ? "bg-purple-100 text-purple-800" :
                          "bg-red-100 text-red-800"
                        )}>
                          {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          
          {/* Check-in Form */}
          <div className="lg:col-span-2">
            {!selectedTripId ? (
              <Card className="p-5 flex items-center justify-center h-full text-gray-500">
                Please select a trip to check in
              </Card>
            ) : (
              <div className="space-y-6">
                <Card className="p-5">
                  <h2 className="text-lg font-semibold mb-4">Your Check-in Status</h2>
                  
                  {isLoadingUserCheckIn ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Status
                        </label>
                        <Select
                          value={formData.status}
                          onValueChange={(value: "ready" | "not-ready" | "maybe") => 
                            setFormData({ ...formData, status: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select your status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ready" className="flex items-center">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" /> Ready
                            </SelectItem>
                            <SelectItem value="not-ready">
                              <div className="flex items-center">
                                <XCircle className="h-4 w-4 text-red-500 mr-2" /> Not Ready
                              </div>
                            </SelectItem>
                            <SelectItem value="maybe">
                              <div className="flex items-center">
                                <Clock className="h-4 w-4 text-yellow-500 mr-2" /> Maybe
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Notes (Optional)
                        </label>
                        <Textarea
                          placeholder="Add any additional notes..."
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          rows={3}
                        />
                      </div>
                      
                      <Button
                        type="submit"
                        disabled={checkInMutation.isPending}
                        className="w-full"
                      >
                        {checkInMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Checking in...
                          </>
                        ) : userCheckIn ? "Update Check-in" : "Check-in"}
                      </Button>
                    </form>
                  )}
                </Card>
                
                <Card className="p-5">
                  <h2 className="text-lg font-semibold mb-4">Group Check-in Status</h2>
                  
                  {isLoadingCheckInStatus ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !checkInStatus || checkInStatus.checkInStatuses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No one has checked in yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {checkInStatus.checkInStatuses.map((status: CheckInStatus, index: number) => (
                        <div key={index} className="flex items-center p-3 border rounded-md">
                          {getStatusIcon(status.status)}
                          <div className="ml-3">
                            <div className="font-medium">
                              User {status.userId === user?.id ? "(You)" : status.userId}
                            </div>
                            <div className={cn("text-sm", getStatusColor(status.status))}>
                              {getStatusText(status.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default CheckInPage;