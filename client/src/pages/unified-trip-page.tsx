import { useToast } from "@/hooks/use-toast";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowLeft, CheckCircle2, MapPin } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trip, ItineraryItem } from "@shared/schema";
import { TripCheckIn } from "@/components/trips/trip-check-in";
import { TripCheckInStatus } from "@/components/trips/trip-check-in-status";
import TripTracking from "@/components/trips/trip-tracking";

// Interface to define the shape of user data
export interface CheckInUser {
  id: number;
  userId: number;
  username: string;
  displayName: string;
}

// Helper function to safely parse JSON strings or return a default value
function tryParseJSON(jsonString: string | null | undefined | any[], defaultValue: any = []) {
  // If it's already an array, just return it
  if (Array.isArray(jsonString)) {
    return jsonString;
  }
  
  // If it's null, undefined, or empty, return the default value
  if (jsonString === null || jsonString === undefined || jsonString === '') {
    return defaultValue;
  }
  
  // If it's already an object (but not an array), use it as is
  if (typeof jsonString === 'object') {
    return jsonString;
  }
  
  try {
    const parsed = JSON.parse(jsonString);
    // Ensure the result matches the expected type
    if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
      console.warn("Parsed JSON is not an array when array was expected:", parsed);
      return defaultValue;
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse JSON string:", jsonString, e);
    // If it's not valid JSON and it's a string, treat it as a comma-separated string
    if (typeof jsonString === 'string' && jsonString.includes(',')) {
      return jsonString.split(',').map(item => item.trim());
    }
    return defaultValue;
  }
}

// Define an extended type for our form data structure
interface FormDataWithExtras {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  groupId?: number;
  startLocation: string;
  endLocation: string;
  startTime?: string;
  endTime?: string;
  isMultiStop: boolean;
  isRecurring?: boolean;
  recurrencePattern?: string;
  recurrenceDays?: string[];
  stops?: Array<{
    day: number;
    title: string;
    startLocation: string;
    endLocation: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    isRecurring?: boolean;
    recurrencePattern?: string;
    recurrenceDays?: string[];
  }>;
}

export default function UnifiedTripPage() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const params = useParams();
  const tripId = params.tripId;
  const queryClient = useQueryClient();
  
  // Parse the URL to extract tab information
  const getTabFromUrl = () => {
    if (!tripId) return "form";
    
    try {
      // Split the URL at the ? mark and parse parameters
      const searchParams = new URLSearchParams(window.location.search);
      console.log("DIRECT ACCESS - Search params from window.location.search:", searchParams.toString());
      
      // Get tab from URL parameters
      const tabParam = searchParams.get('tab');
      // Handle legacy edit parameter
      const editParam = searchParams.get('edit');
      
      console.log("URL Parameters detected:", { 
        tabParam, 
        editParam,
        fullLocationSearch: window.location.search,
        windowLocationHref: window.location.href
      });
      
      // Map legacy edit=true parameter to form tab
      if (editParam === 'true') {
        console.log("Legacy edit=true parameter detected. Using form tab.");
        return "form";
      }
      
      // Validate the tab parameter
      const validTabs = ["form", "preview", "check-in", "tracking"];
      if (tabParam && validTabs.includes(tabParam)) {
        console.log(`Valid tab parameter detected: ${tabParam}`);
        return tabParam;
      }
      
      // When coming from the schedule list view and no specific tab is requested,
      // default to "preview" tab when viewing a schedule details
      if (tripId && !tabParam && !editParam) {
        console.log("Schedule details view detected with no specific tab, defaulting to preview");
        return "preview";
      }
      
      console.log("No valid tab parameter found, defaulting to form");
      return "form";
    } catch (error) {
      console.error("Error parsing URL parameters:", error);
      return "form";
    }
  };
  
  // State to track the active tab
  const [activeTab, setActiveTab] = useState<string>(getTabFromUrl());
  
  // Update tab when URL changes
  useEffect(() => {
    console.log("URL or tripId changed, updating active tab");
    const newTab = getTabFromUrl();
    console.log(`Setting active tab to: ${newTab} (from URL)`); 
    setActiveTab(newTab);
  }, [window.location.search, tripId]);
  
  // Function to handle tab changes from the UI
  const handleTabChange = (tab: string) => {
    console.log(`Tab changed to: ${tab} (from UI interaction)`);
    setActiveTab(tab);
    
    // Update the URL to reflect the tab change
    if (tripId) {
      const newUrl = `/schedules/${tripId}?tab=${tab}`;
      console.log(`Updating URL to: ${newUrl}`);
      navigate(newUrl, { replace: true });
    }
  };
  
  // Define extended Trip type with _accessLevel
  type ExtendedTrip = Trip & { _accessLevel?: 'owner' | 'member'; startLocationDisplay?: string; destinationDisplay?: string; };

  // Query for existing trip if editing
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<ExtendedTrip | undefined>({
    queryKey: tripId ? ["/api/schedules", parseInt(tripId)] : (["/api/schedules", "no-id"] as const),
    enabled: !!tripId,
  });
  
  // Query for itinerary items if editing a schedule
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: tripId ? ["/api/schedules", parseInt(tripId), "itinerary"] : (["/api/schedules", "no-id", "itinerary"] as const),
    enabled: !!tripId,
  });
  
  // Query for group members if the schedule belongs to a group
  const { data: groupMembersData } = useQuery({
    queryKey: [`/api/groups/${tripData?.groupId}/members`],
    enabled: !!tripData?.groupId,
  });
  
  // Query for all users to get user information
  const { data: users } = useQuery({
    queryKey: [`/api/users`],
    enabled: !!tripData?.groupId,
  });
  


  // Create properly formatted group members data, with userId property
  const groupMembers = React.useMemo(() => {
    if (!groupMembersData || !users) return [] as CheckInUser[];
    
    // Map group member IDs to user information
    const membersList = Array.isArray(groupMembersData) 
      ? groupMembersData.map(member => {
          const user = Array.isArray(users) ? users.find(u => u.id === member.userId) : null;
          return user ? {
            id: member.id,
            userId: member.userId,
            username: user.username,
            displayName: user.displayName || user.username
          } : null;
        }).filter((member): member is CheckInUser => member !== null)
      : [];
    
    return membersList;
  }, [groupMembersData, users]);
  
  // Mutation for creating/updating schedules
  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log('MUTATION START - Form data received:', formData);
      if (tripId) {
        // Update existing trip
        console.log("PATCH request payload:", JSON.stringify(formData));
        console.log("Request includes itinerary items:", formData.itineraryItems ? formData.itineraryItems.length : 0);
        
        if (formData.itineraryItems && formData.itineraryItems.length > 0) {
          // Log each itinerary item ID for debugging
          formData.itineraryItems.forEach((item: any, idx: number) => {
            console.log(`Item ${idx} - ID: ${item.id || 'NEW'}, day: ${item.day}, title: ${item.title}`);
          });
        }
        
        try {
          console.log(`About to send PATCH request to /api/schedules/${tripId}`);
          const res = await apiRequest("PATCH", `/api/schedules/${tripId}`, formData);
          console.log('PATCH request successful, parsing response');
          const jsonResponse = await res.json();
          console.log("PATCH response:", JSON.stringify(jsonResponse));
          return jsonResponse;
        } catch (error) {
          console.error("PATCH request failed:", error);
          throw error;
        }
      } else {
        // Create new trip - ensure enableMobileNotifications is set
        console.log("Creating new trip with data:", JSON.stringify(formData));
        
        // Ensure enableMobileNotifications is set to true by default
        if (formData.enableMobileNotifications === undefined) {
          formData.enableMobileNotifications = true;
        }
        
        try {
          console.log("About to send POST request to /api/schedules");
          const res = await apiRequest("POST", "/api/schedules", formData);
          console.log("POST request successful, parsing response");
          const jsonResponse = await res.json();
          console.log("POST response:", JSON.stringify(jsonResponse));
          return jsonResponse;
        } catch (error) {
          console.error("POST request failed:", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast({
        title: tripId ? "Schedule updated" : "Schedule created",
        description: tripId 
          ? "Your schedule has been updated successfully." 
          : "Your new schedule has been created successfully.",
      });
      
      // Force invalidate all schedule-related queries
      console.log("Invalidating schedule queries after create/update");
      
      // Completely clear the cache for schedules
      queryClient.removeQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      
      // Navigate back to schedules page with a small delay to ensure cache is cleared
      setTimeout(() => {
        const targetUrl = "/schedules";
        console.log(`Navigating to ${targetUrl} after schedule creation/update`);
        navigate(targetUrl);
        
        // Force a refetch after navigation
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ["/api/schedules"] });
        }, 200);
      }, 300);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to ${tripId ? "update" : "create"} schedule: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Transform data from existing trip + itinerary to match the unified form structure
  const prepareFormData = (): any => {
    if (!tripData) return {};
    
    console.log("Preparing form data with trip data:", tripData);
    console.log("Using itinerary items:", itineraryItems);
    
    // Extract times from trip dates
    const startDate = new Date(tripData.startDate);
    const endDate = new Date(tripData.endDate);
    
    // Format times as HH:MM for the form inputs
    const extractTimeString = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };
    
    const defaultStartTime = extractTimeString(startDate);
    const defaultEndTime = extractTimeString(endDate);
    
    console.log(`Extracted times from dates - Start: ${defaultStartTime}, End: ${defaultEndTime}`);
    
    // Start with basic trip data
    const formData: any = {
      name: tripData.name,
      description: tripData.description || "",
      startDate: startDate,
      endDate: endDate,
      groupId: tripData.groupId || undefined,
      status: tripData.status || "planning",
      // These fields are now part of the unified schema but might come from itinerary
      startLocation: tripData.startLocation || "",
      endLocation: tripData.destination || "", // Map destination from DB to endLocation in form
      // Default to single stop if we don't have itinerary items
      isMultiStop: false,
      isRecurring: false,
      // Use times extracted from the dates
      startTime: defaultStartTime,
      endTime: defaultEndTime
    };
    
    // If we have itinerary items, populate the stops array for multi-stop trips
    if (itineraryItems && itineraryItems.length > 0) {
      // For standard itinerary items, transform them to stops
      const stops = itineraryItems.map((item, index) => {
        // Convert recurrencePattern to one of the valid values
        let pattern = item.recurrencePattern;
        if (pattern && !["daily", "weekly", "monthly", "custom"].includes(pattern)) {
          pattern = "custom"; // Default to custom if it's not one of the expected values
        }
        
        // Create default logical locations if not available in the itinerary item
        // This ensures we have location data for each stop regardless of DB nulls
        let startLocation = "";
        let endLocation = "";
        
        const isFirstItem = index === 0;
        const isLastItem = index === itineraryItems.length - 1;
        
        // Enhanced logic for location assignment based on position
        if (isFirstItem) {
          // First stop: Use first itinerary fromLocation or trip startLocation
          startLocation = (item.fromLocation && item.fromLocation !== "") ? 
                           item.fromLocation : tripData.startLocation || "Unknown location";
        } else if (index > 0) {
          // Middle stops: Use this item's fromLocation, previous item's toLocation, or chain backwards
          if (item.fromLocation && item.fromLocation !== "") {
            startLocation = item.fromLocation;
          } else {
            // Try to get the previous stop's end location
            const prevItem = itineraryItems[index-1];
            if (prevItem?.toLocation && prevItem.toLocation !== "") {
              startLocation = prevItem.toLocation;
            } else {
              // If all fails, use trip start location as last resort
              startLocation = tripData.startLocation || "Unknown location";
            }
          }
        }
        
        if (isLastItem) {
          // Last stop: Use last itinerary toLocation or trip destination
          endLocation = (item.toLocation && item.toLocation !== "") ? 
                         item.toLocation : tripData.destination || "Unknown location";
        } else {
          // Not the last stop: Use this item's toLocation or try to infer
          if (item.toLocation && item.toLocation !== "") {
            endLocation = item.toLocation;
          } else if (index < itineraryItems.length - 1 && 
                    itineraryItems[index+1]?.fromLocation && 
                    itineraryItems[index+1].fromLocation !== "") {
            // Use next stop's start location if available
            endLocation = itineraryItems[index+1].fromLocation || "Unknown location";
          } else if (tripData?.destination) {
            // Fall back to trip destination if nothing else is available
            endLocation = tripData.destination || "Unknown location";
          }
        }
        
        console.log(`Processing stop ${index+1} - fromLoc: ${item.fromLocation}, toLoc: ${item.toLocation}`);
        console.log(`Using startLoc: ${startLocation}, endLoc: ${endLocation}`);
        
        return {
          id: item.id, // IMPORTANT: Include the ID for existing items
          day: item.day,
          title: item.title || "",
          startLocation: startLocation,
          endLocation: endLocation,
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          description: item.description || "",
          isRecurring: item.isRecurring || false,
          recurrencePattern: pattern as "daily" | "weekly" | "monthly" | "custom" | undefined,
          recurrenceDays: item.recurrenceDays ? tryParseJSON(item.recurrenceDays as string) : [],
        };
      });
      
      // If it's a single-stop trip, extract data from the first itinerary item
      if (itineraryItems.length === 1) {
        const item = itineraryItems[0];
        console.log("Single-stop trip detected, processing item:", item);

        // Prioritize using trip data for locations when itinerary locations are null/empty
        formData.startLocation = item.fromLocation || tripData.startLocation || "Unknown location";
        formData.endLocation = item.toLocation || tripData.destination || "Unknown location";
        
        // Prioritize using itinerary time if available, or keep what we extracted from trip dates
        formData.startTime = item.startTime || formData.startTime;
        formData.endTime = item.endTime || formData.endTime;
        formData.isRecurring = item.isRecurring || false;
        
        console.log(`Single stop - using startLoc: ${formData.startLocation}, endLoc: ${formData.endLocation}`);
        
        // Convert recurrencePattern to a valid value
        if (item.recurrencePattern) {
          const pattern = item.recurrencePattern;
          if (["daily", "weekly", "monthly", "custom"].includes(pattern)) {
            formData.recurrencePattern = pattern;
          } else {
            formData.recurrencePattern = "custom";
          }
        }
        
        formData.recurrenceDays = item.recurrenceDays ? tryParseJSON(item.recurrenceDays as string) : [];
      } else {
        // It's a multi-stop trip
        formData.isMultiStop = true;
        formData.stops = stops;
      }
    }
    
    return formData;
  };
  
  // Handle form submission
  const handleSubmit = (data: any) => {
    console.log("PAGE COMPONENT - handleSubmit called with data:", data);
    console.log("Current trip data in handleSubmit:", tripData);
    console.log("Form submission for trip ID:", tripId);
    console.log("Mutation state - isPending:", mutation.isPending, "isSuccess:", mutation.isSuccess, "isError:", mutation.isError);
    
    // Format data for the API
    if (data.isMultiStop) {
      // For multi-stop trips, we need to:
      // 1. Update the trip record with basic info
      // 2. Create/update itinerary items for each stop
      
      // Ensure we have valid stops data before accessing it
      const hasValidStops = data.stops && Array.isArray(data.stops) && data.stops.length > 0;
      
      console.log("Processing multi-stop trip with stops:", data.stops);
      
      // Create a variable for the API request
      const tripUpdateData = {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status || "planning",
        startLocation: hasValidStops && data.stops[0]?.startLocation 
                      ? data.stops[0].startLocation 
                      : (tripData?.startLocation || data.startLocation || "Unknown location"),
        destination: hasValidStops && data.stops[data.stops.length - 1]?.endLocation 
                   ? data.stops[data.stops.length - 1].endLocation 
                   : (data.endLocation || tripData?.destination || "Unknown location"),
        groupId: data.groupId,
        isRecurring: data.isRecurring || false,
        recurrencePattern: data.recurrencePattern || null,
        enableMobileNotifications: data.enableMobileNotifications !== undefined ? data.enableMobileNotifications : true,
        // Convert the stops data to itinerary items
        itineraryItems: hasValidStops 
          ? data.stops.map((stop: any) => {
              const itemData = {
                day: stop.day || 1, // Ensure day is never undefined
                title: stop.title || "",
                description: stop.description || "",
                fromLocation: stop.startLocation || data.startLocation || "", // Use stop's start location or trip's start location
                toLocation: stop.endLocation || data.endLocation || "", // Use stop's end location or trip's end location
                startTime: stop.startTime || "",
                endTime: stop.endTime || "",
                isRecurring: stop.isRecurring || false,
                recurrencePattern: stop.recurrencePattern || null,
                recurrenceDays: stop.recurrenceDays?.length ? JSON.stringify(stop.recurrenceDays) : null,
              };
              
              // If we have an ID, add it to update the existing item instead of creating a new one
              if (stop.id) {
                return { id: stop.id, ...itemData };
              }
              
              return itemData;
            }) 
          : []
      };
      
      console.log("Multi-trip update data:", JSON.stringify(tripUpdateData));
      mutation.mutate(tripUpdateData);
    } else {
      // For single-stop trips, create a single itinerary item
      const singleTripData = {
        name: data.name,
        description: data.description || "",
        startDate: data.startDate,
        endDate: data.endDate,
        startLocation: data.startLocation || "Unknown location",
        destination: data.endLocation || "Unknown location",
        groupId: data.groupId,
        status: data.status || "planning",
        isRecurring: data.isRecurring || false,
        recurrencePattern: data.recurrencePattern || null,
        enableMobileNotifications: data.enableMobileNotifications !== undefined ? data.enableMobileNotifications : true,
        // Create a single itinerary item
        itineraryItems: [{
          day: 1,
          title: data.name,
          description: data.description || "",
          fromLocation: data.startLocation || "Unknown location",
          toLocation: data.endLocation || "Unknown location",
          startTime: data.startTime || "",
          endTime: data.endTime || "",
          isRecurring: data.isRecurring || false,
          recurrencePattern: data.recurrencePattern || null,
          recurrenceDays: data.recurrenceDays?.length
            ? JSON.stringify(data.recurrenceDays)
            : null,
        }],
      };
      
      console.log("Single trip update data:", JSON.stringify(singleTripData));
      mutation.mutate(singleTripData);
    }
  };
  
  const isLoading = isLoadingTrip || isLoadingItinerary;
  const defaultValues = prepareFormData();
  
  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex items-center mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/schedules")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              {tripId ? "Edit Schedule" : "Create New Schedule"}
            </h1>
          </div>
        </div>
        
        <div className="max-w-5xl mx-auto">
          {tripId ? (
            <Tabs 
              value={activeTab} 
              onValueChange={handleTabChange} 
              className="w-full"
              defaultValue="form"
            >
              <TabsList className="grid w-[800px] grid-cols-4 mx-auto mb-4">
                <TabsTrigger 
                  value="form" 
                  data-active={activeTab === "form"}
                  className={activeTab === "form" ? "data-[state=active]:bg-primary-500" : ""}
                >
                  Edit Schedule
                </TabsTrigger>
                <TabsTrigger 
                  value="preview" 
                  data-active={activeTab === "preview"}
                  className={activeTab === "preview" ? "data-[state=active]:bg-primary-500" : ""}
                >
                  Preview
                </TabsTrigger>
                <TabsTrigger 
                  value="check-in" 
                  data-active={activeTab === "check-in"}
                  className={activeTab === "check-in" ? "data-[state=active]:bg-primary-500" : ""}
                >
                  Check-In
                </TabsTrigger>
                <TabsTrigger 
                  value="tracking" 
                  data-active={activeTab === "tracking"}
                  className={activeTab === "tracking" ? "data-[state=active]:bg-primary-500" : ""}
                  disabled={tripData?.status !== "in-progress"}
                >
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Track Location
                  </div>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="form" className="mt-0">
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-60" />
                    <Skeleton className="h-40 w-full" />
                    <div className="grid grid-cols-2 gap-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                    <Skeleton className="h-60 w-full" />
                  </div>
                ) : (
                  <UnifiedTripForm
                    onSubmit={(data) => {
                      console.log('UnifiedTripPage - onSubmit callback received data from form:', data);
                      handleSubmit(data);
                    }}
                    defaultValues={defaultValues}
                    isLoading={mutation.isPending}
                    isEditing={true}
                    onCancel={() => {
                      console.log('Cancel callback called');
                      navigate("/schedules");
                    }}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="preview" className="mt-0">
                <div className="bg-muted p-6 rounded-lg">
                  <h2 className="text-xl font-medium mb-4">Schedule Preview</h2>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-medium">{tripData?.name}</h3>
                        <p className="text-muted-foreground">
                          {tripData?.startDate ? new Date(tripData.startDate).toLocaleDateString() : ""} to {tripData?.endDate ? new Date(tripData.endDate).toLocaleDateString() : ""}
                        </p>
                        {tripData?.description && (
                          <p className="mt-2">{tripData.description}</p>
                        )}
                      </div>
                      
                      <div className="bg-card p-4 rounded-lg border">
                        <h4 className="font-medium mb-2">Stops & Itinerary</h4>
                        {itineraryItems && itineraryItems.length > 0 ? (
                          <div className="space-y-3">
                            {itineraryItems.map((item, index) => (
                              <div key={index} className="border-b pb-3 last:border-0">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-medium">{item.title}</span>
                                    <div className="text-sm text-muted-foreground">
                                      {item.fromLocation} → {item.toLocation}
                                    </div>
                                    {item.startTime && (
                                      <div className="text-xs">
                                        {formatTime(item.startTime)} - {formatTime(item.endTime)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Day {item.day}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No itinerary items yet</p>
                        )}
                      </div>
                      
                      {/* Add member check-in status section */}
                      <div className="mt-6">
                        <TripCheckInStatus 
                          tripId={parseInt(tripId)} 
                          accessLevel={tripData?._accessLevel || 'member'} 
                          tripStatus={tripData?.status || 'planning'} 
                          groupMembers={groupMembers}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="check-in" className="mt-0">
                <div className="bg-muted p-6 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <h2 className="text-xl font-medium">Schedule Check-In</h2>
                  </div>
                  
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : tripData ? (
                    <div className="space-y-6">
                      {/* Display check-in status */}
                      <TripCheckInStatus 
                        tripId={parseInt(tripId)} 
                        accessLevel={tripData?._accessLevel || 'member'} 
                        tripStatus={tripData?.status || 'planning'} 
                        groupMembers={groupMembers}
                      />
                      
                      {/* Display check-in form */}
                      <TripCheckIn 
                        tripId={parseInt(tripId)} 
                        accessLevel={tripData?._accessLevel || 'member'} 
                        tripStatus={tripData?.status || 'planning'}
                        groupMembers={groupMembers.map(member => ({
                          id: member.userId,
                          username: member.username,
                          displayName: member.displayName
                        }))}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Schedule data not available
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="tracking" className="mt-0">
                <div className="bg-muted p-6 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    <h2 className="text-xl font-medium">Schedule Location Tracking</h2>
                  </div>
                  
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : tripData ? (
                    <div className="space-y-6">
                      {tripData.status === "in-progress" ? (
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            {/* Location tracking component */}
                            <TripTracking
                              tripId={parseInt(tripId)}
                              tripName={tripData.name}
                              isActive={activeTab === "tracking"}
                            />
                            
                            {/* Trip details card */}
                            <div className="bg-card p-4 rounded-lg border mt-4">
                              <h3 className="font-medium mb-2">Trip Details</h3>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-muted-foreground">From:</p>
                                  <p className="font-medium">{tripData.startLocationDisplay || tripData.startLocation}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">To:</p>
                                  <p className="font-medium">{tripData.destinationDisplay || tripData.destination}</p>
                                </div>
                                <div className="col-span-2 mt-2">
                                  <p className="text-muted-foreground">Status:</p>
                                  <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    <p className="font-medium">In Progress</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            {/* Map view (future enhancement) */}
                            <div className="border rounded-lg p-4 h-[400px] bg-card flex flex-col items-center justify-center">
                              <p className="text-center text-muted-foreground">
                                Map view will be available in a future update.
                              </p>
                              <p className="text-sm text-center text-muted-foreground mt-2">
                                Your current location is being tracked and shared with group members.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-card rounded-lg border">
                          <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-lg font-medium">Trip Tracking Not Available</h3>
                          <p className="text-muted-foreground mt-2">
                            Location tracking is only available for trips with status "in-progress".
                          </p>
                          <p className="text-muted-foreground mt-1">
                            Current trip status: <span className="font-medium">{tripData.status}</span>
                          </p>
                          {tripData.status === "planning" && tripData._accessLevel === "owner" && (
                            <div className="mt-4">
                              <Button
                                onClick={async () => {
                                  try {
                                    // Update trip status to in-progress
                                    await apiRequest("PATCH", `/api/trips/${tripId}`, {
                                      status: "in-progress"
                                    });
                                    
                                    // Refetch trip data
                                    queryClient.invalidateQueries({ queryKey: ["/api/trips", parseInt(tripId)] });
                                    
                                    toast({
                                      title: "Trip started",
                                      description: "Trip status changed to 'in progress'. Location tracking is now available."
                                    });
                                  } catch (error) {
                                    toast({
                                      title: "Error",
                                      description: "Failed to update trip status.",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                Start Trip Now
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Schedule data not available
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <UnifiedTripForm
              onSubmit={handleSubmit}
              defaultValues={defaultValues}
              isLoading={mutation.isPending}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}