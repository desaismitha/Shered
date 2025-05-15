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
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, PlusCircle, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// Define interface for the Schedule data structure
interface Schedule {
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
  latitude?: number;
  longitude?: number;
}

interface CheckIn {
  id: number;
  scheduleId: number;
  userId: number;
  checkedInAt: string;
  status: string;
  notes: string;
  latitude?: number;
  longitude?: number;
  locationVerified?: boolean;
}

interface CheckInStatus {
  userId: number;
  status: string;
  locationVerified?: boolean;
}

interface CheckInStatusData {
  checkInStatuses: CheckInStatus[];
  scheduleInfo: {
    startLocation: string;
    startLocationDisplay?: string;
    destination: string;
    destinationDisplay?: string;
  };
}

interface CheckInResponse {
  checkIn: CheckIn;
  allReady: boolean;
  notification: string | null;
  locationStatus: {
    verified: boolean;
    message: string;
  }
}

function CheckInPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [formData, setFormData] = useState<CheckInFormData>({
    status: "ready",
    notes: "",
    latitude: undefined,
    longitude: undefined,
  });
  const [locationStatus, setLocationStatus] = useState<{
    acquiring: boolean;
    error: string | null;
    verified: boolean;
    message: string | null;
  }>({
    acquiring: false,
    error: null,
    verified: false,
    message: null,
  });
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  
  // Fetch all schedules the user is part of
  const {
    data: schedules = [],
    isLoading: isLoadingSchedules,
    error: schedulesError,
  } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Filter schedules based on showPastSchedules toggle
  const filteredSchedules = schedules.filter(schedule => {
    if (showPastSchedules) return true;
    return ["planning", "confirmed", "in-progress"].includes(schedule.status);
  });
  
  // Fetch user's check-in status for the selected schedule
  const {
    data: userCheckIn,
    isLoading: isLoadingUserCheckIn,
  } = useQuery<CheckIn>({
    queryKey: ["/api/schedules", selectedScheduleId, "check-ins/user", user?.id],
    enabled: !!selectedScheduleId && !!user?.id,
  });
  
  // Fetch all check-in statuses for the selected schedule
  const {
    data: checkInStatus,
    isLoading: isLoadingCheckInStatus,
  } = useQuery<CheckInStatusData>({
    queryKey: ["/api/schedules", selectedScheduleId, "check-in-status"],
    enabled: !!selectedScheduleId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  
  // Function to get current location
  const getCurrentLocation = async (): Promise<void> => {
    if (!navigator.geolocation) {
      setLocationStatus({
        acquiring: false,
        error: "Geolocation is not supported by your browser.",
        verified: false,
        message: null
      });
      return;
    }

    setLocationStatus(prev => ({ ...prev, acquiring: true, error: null }));

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;
      
      // Update form data with location
      setFormData(prev => ({
        ...prev,
        latitude,
        longitude
      }));
      
      setLocationStatus(prev => ({
        ...prev,
        acquiring: false,
        message: "Location acquired successfully. Check-in will be verified based on your current location."
      }));
      
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationStatus({
        acquiring: false,
        error: error instanceof Error ? error.message : "Could not get your location. Please check your device settings.",
        verified: false,
        message: null
      });
    }
  };

  // Initialize form data when user check-in status is loaded
  useEffect(() => {
    if (userCheckIn) {
      setFormData({
        status: (userCheckIn.status as "ready" | "not-ready" | "maybe") || "ready",
        notes: userCheckIn.notes || "",
        latitude: userCheckIn.latitude,
        longitude: userCheckIn.longitude
      });
      
      // If they have a previous check-in with verified location, show that status
      if (userCheckIn.locationVerified) {
        setLocationStatus(prev => ({
          ...prev,
          verified: true,
          message: "Your location has been verified for this check-in."
        }));
      }
    } else {
      // Reset form if no check-in exists
      setFormData({
        status: "ready",
        notes: "",
        latitude: undefined,
        longitude: undefined
      });
      
      // Try to get location when a schedule is selected and there's no existing check-in
      if (selectedScheduleId) {
        getCurrentLocation();
      }
    }
  }, [userCheckIn, selectedScheduleId]);
  
  // Update selectedSchedule when schedules or selectedScheduleId changes
  useEffect(() => {
    if (selectedScheduleId && schedules.length > 0) {
      const schedule = schedules.find(s => s.id === selectedScheduleId);
      if (schedule) {
        setSelectedSchedule(schedule);
        console.log(`Selected schedule updated: ${schedule.name} with start location ${schedule.startLocation}`);
      }
    } else {
      setSelectedSchedule(null);
    }
  }, [schedules, selectedScheduleId]);

  // Mutation for creating/updating check-in
  const checkInMutation = useMutation({
    mutationFn: async (data: CheckInFormData) => {
      if (!selectedScheduleId) throw new Error("No schedule selected");
      
      const response = await apiRequest(
        "POST",
        `/api/schedules/${selectedScheduleId}/check-ins`,
        data
      );
      return response.json() as Promise<CheckInResponse>;
    },
    onSuccess: (data) => {
      // Update location status based on server response
      setLocationStatus(prev => ({
        ...prev,
        verified: data.locationStatus.verified,
        message: data.locationStatus.message,
        acquiring: false
      }));
      
      // Different toast message based on location verification
      if (data.locationStatus.verified) {
        toast({
          title: "Check-in successful",
          description: "Your location has been verified and check-in is complete.",
        });
      } else {
        // If there's a location message but not verified, it means we need to show a warning
        if (data.locationStatus.message && !data.locationStatus.verified) {
          toast({
            title: "Check-in recorded with warning",
            description: data.locationStatus.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Check-in successful",
            description: "Your check-in status has been updated.",
          });
        }
      }
      
      // Invalidate the queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ["/api/schedules", selectedScheduleId, "check-ins/user", user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/schedules", selectedScheduleId, "check-in-status"],
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
        <h1 className="text-2xl font-bold mb-6">Schedule Check-in</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Schedule Selector */}
          <div className="lg:col-span-1">
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">Select a Schedule</h2>
              
              <div className="mb-4 flex items-center space-x-2">
                <Switch 
                  id="show-past-schedules"
                  checked={showPastSchedules}
                  onCheckedChange={setShowPastSchedules}
                />
                <Label htmlFor="show-past-schedules">Show past schedules</Label>
              </div>
              
              {isLoadingSchedules ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : schedulesError ? (
                <div className="text-red-500 p-4 border border-red-200 rounded-md">
                  Error loading schedules: {schedulesError instanceof Error ? schedulesError.message : "Unknown error. Please try again."}
                </div>
              ) : filteredSchedules.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  {showPastSchedules 
                    ? "No schedules found. Create a schedule first." 
                    : "No active schedules found. Try enabling 'Show past schedules' to see completed schedules."}
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {filteredSchedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={cn(
                        "p-3 border rounded-md cursor-pointer transition-colors",
                        selectedScheduleId === schedule.id
                          ? "border-primary bg-primary-50"
                          : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                      )}
                      onClick={() => setSelectedScheduleId(schedule.id)}
                    >
                      <div className="font-medium">{schedule.name}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(schedule.startDate).toLocaleDateString()} - {new Date(schedule.endDate).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        From: {schedule.startLocationDisplay || schedule.startLocation.split("[")[0]}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        To: {schedule.destinationDisplay || schedule.destination.split("[")[0]}
                      </div>
                      <div className="flex items-center mt-2">
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 text-xs font-medium rounded-full",
                          schedule.status === "planning" ? "bg-gray-100 text-gray-800" :
                          schedule.status === "confirmed" ? "bg-blue-100 text-blue-800" :
                          schedule.status === "in-progress" ? "bg-green-100 text-green-800" :
                          schedule.status === "completed" ? "bg-purple-100 text-purple-800" :
                          "bg-red-100 text-red-800"
                        )}>
                          {schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1)}
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
            {!selectedScheduleId ? (
              <Card className="p-5 flex items-center justify-center h-full text-gray-500">
                Please select a schedule to check in
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
                      
                      {/* Location Status */}
                      <div className="p-3 border rounded-md bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium mb-1">Location Verification</span>
                            {locationStatus.acquiring ? (
                              <div className="flex items-center text-blue-500 text-sm mt-1">
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Acquiring your location...
                              </div>
                            ) : locationStatus.error ? (
                              <div className="text-red-500 text-sm mt-1">
                                {locationStatus.error}
                              </div>
                            ) : locationStatus.verified ? (
                              <div className="flex items-center text-green-500 text-sm mt-1">
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Location verified
                              </div>
                            ) : formData.latitude && formData.longitude ? (
                              <div className="flex items-center text-yellow-500 text-sm mt-1">
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Location needs verification
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm mt-1">
                                No location data available
                              </div>
                            )}
                            
                            {locationStatus.message && (
                              <div className="text-sm mt-2">
                                {locationStatus.message}
                              </div>
                            )}
                            
                            {/* Display coordinates when available */}
                            {formData.latitude && formData.longitude && (
                              <div className="flex items-center text-xs text-gray-500 mt-2">
                                <MapPin className="h-3 w-3 mr-1" />
                                <span>
                                  {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                                </span>
                              </div>
                            )}

                            {/* Schedule start location when available */}
                            {selectedSchedule?.startLocation && (
                              <div className="flex items-center text-xs text-gray-500 mt-1">
                                <span className="mr-1">Meeting point:</span>
                                <span className="font-semibold">{selectedSchedule.startLocationDisplay || selectedSchedule.startLocation}</span>
                              </div>
                            )}
                          </div>
                          
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={getCurrentLocation}
                            disabled={locationStatus.acquiring}
                          >
                            {locationStatus.acquiring ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-1" />
                                Update Location
                              </div>
                            )}
                          </Button>
                        </div>
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