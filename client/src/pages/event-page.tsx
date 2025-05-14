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
import { CheckInUser } from "@/pages/unified-trip-page";

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

// Use the same type that the form expects to ensure compatibility
type FormData = {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  groupId?: number;
  startLocation: string;
  endLocation: string;
  startTime?: string;
  endTime?: string;
  status?: "planning" | "confirmed" | "in-progress" | "completed" | "cancelled";
  isMultiStop: boolean;
  isRecurring?: boolean;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "custom";
  recurrenceDays?: string[];
  enableMobileNotifications: boolean;
  phoneNumber?: string;
  stops?: Array<{
    id?: number;
    day: number;
    title: string;
    startLocation: string;
    endLocation: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    isRecurring?: boolean;
    recurrencePattern?: "daily" | "weekly" | "monthly" | "custom";
    recurrenceDays?: string[];
  }>;
};

export default function EventPage() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const params = useParams();
  const eventId = params.eventId;
  const queryClient = useQueryClient();
  
  // Parse the URL to extract tab information
  const getTabFromUrl = () => {
    if (!eventId) return "form";
    
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
    console.log("URL or eventId changed, updating active tab");
    const newTab = getTabFromUrl();
    console.log(`Setting active tab to: ${newTab} (from URL)`); 
    setActiveTab(newTab);
  }, [window.location.search, eventId]);
  
  // Function to handle tab changes from the UI
  const handleTabChange = (tab: string) => {
    console.log(`Tab changed to: ${tab} (from UI interaction)`);
    setActiveTab(tab);
    
    // Update the URL to reflect the tab change
    if (eventId) {
      const newUrl = `/events/${eventId}?tab=${tab}`;
      console.log(`Updating URL to: ${newUrl}`);
      navigate(newUrl, { replace: true });
    }
  };
  
  // Define extended Trip type with _accessLevel
  type ExtendedTrip = Trip & { _accessLevel?: 'owner' | 'member'; startLocationDisplay?: string; destinationDisplay?: string; };

  // Query for existing event if editing
  const { data: eventData, isLoading: isLoadingEvent } = useQuery<ExtendedTrip | undefined>({
    queryKey: eventId ? ["/api/trips", parseInt(eventId)] : (["/api/trips", "no-id"] as const),
    enabled: !!eventId,
  });
  
  // Query for itinerary items if editing an event
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: eventId ? ["/api/trips", parseInt(eventId), "itinerary"] : (["/api/trips", "no-id", "itinerary"] as const),
    enabled: !!eventId,
  });
  
  // Query for group members if the event belongs to a group
  const { data: groupMembersData } = useQuery({
    queryKey: [`/api/groups/${eventData?.groupId}/members`],
    enabled: !!eventData?.groupId,
  });
  
  // Query for all users to get user information
  const { data: users } = useQuery({
    queryKey: [`/api/users`],
    enabled: !!eventData?.groupId,
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
  
  // Mutation for creating/updating events
  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log('MUTATION START - Form data received:', formData);
      if (eventId) {
        // Update existing event
        console.log("PATCH request payload:", JSON.stringify(formData));
        console.log("Request includes itinerary items:", formData.itineraryItems ? formData.itineraryItems.length : 0);
        
        if (formData.itineraryItems && formData.itineraryItems.length > 0) {
          // Log each itinerary item ID for debugging
          formData.itineraryItems.forEach((item: any, idx: number) => {
            console.log(`Item ${idx} - ID: ${item.id || 'NEW'}, day: ${item.day}, title: ${item.title}`);
          });
        }
        
        try {
          console.log(`About to send PATCH request to /api/trips/${eventId}`);
          const res = await apiRequest("PATCH", `/api/trips/${eventId}`, formData);
          console.log('PATCH request successful, parsing response');
          const jsonResponse = await res.json();
          console.log("PATCH response:", JSON.stringify(jsonResponse));
          return jsonResponse;
        } catch (error) {
          console.error("PATCH request failed:", error);
          throw error;
        }
      } else {
        // Create new event - ensure enableMobileNotifications is set
        console.log("Creating new event with data:", JSON.stringify(formData));
        
        // Ensure enableMobileNotifications is set to true by default
        if (formData.enableMobileNotifications === undefined) {
          formData.enableMobileNotifications = true;
        }
        
        try {
          console.log("About to send POST request to /api/trips for event creation");
          const res = await apiRequest("POST", "/api/trips", formData);
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
        title: eventId ? "Event updated" : "Event created",
        description: eventId 
          ? "Your event has been updated successfully." 
          : "Your new event has been created successfully.",
      });
      
      // Force invalidate all trip-related queries
      console.log("Invalidating trip queries after create/update");
      
      // Completely clear the cache for trips
      queryClient.removeQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      
      // Navigate back to trips page with a small delay to ensure cache is cleared
      setTimeout(() => {
        const targetUrl = "/trips";
        console.log(`Navigating to ${targetUrl} after event creation/update`);
        navigate(targetUrl);
        
        // Force a refetch after navigation
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ["/api/trips"] });
        }, 200);
      }, 300);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to ${eventId ? "update" : "create"} event: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Transform data from existing event + itinerary to match the unified form structure
  const prepareFormData = (): any => {
    if (!eventData) return {};
    
    console.log("Preparing form data with event data:", eventData);
    console.log("Using itinerary items:", itineraryItems);
    
    // Extract times from event dates
    const startDate = new Date(eventData.startDate);
    const endDate = new Date(eventData.endDate);
    
    // Format times as HH:MM for the form inputs
    const extractTimeString = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };
    
    const defaultStartTime = extractTimeString(startDate);
    const defaultEndTime = extractTimeString(endDate);
    
    console.log(`Extracted times from dates - Start: ${defaultStartTime}, End: ${defaultEndTime}`);
    
    // Start with basic event data
    const formData: any = {
      name: eventData.name,
      description: eventData.description || "",
      startDate: startDate,
      endDate: endDate,
      groupId: eventData.groupId || undefined,
      status: eventData.status || "planning",
      // These fields are now part of the unified schema but might come from itinerary
      startLocation: eventData.startLocation || "",
      endLocation: eventData.destination || "", // Map destination from DB to endLocation in form
      // Default to single stop if we don't have itinerary items
      isMultiStop: false,
      isRecurring: false,
      // Use times extracted from the dates
      startTime: defaultStartTime,
      endTime: defaultEndTime
    };
    
    // Handle preparations for multi-stop and single-stop events similar to the trip code
    // ... (same code as in unified-trip-page.tsx)
    
    return formData;
  };
  
  // Extract default values from existing event
  const defaultValues = eventData ? prepareFormData() : {};
  
  const pageTitle = eventId 
    ? (isLoadingEvent 
      ? "Loading Event..." 
      : `Edit Event: ${eventData?.name || 'Unnamed Event'}`)
    : "Create New Event";
  
  // Check if loading any dependencies
  const isLoading = mutation.isPending || isLoadingEvent || isLoadingItinerary;
  
  // Handler for form submission
  const handleSubmit = (formData: FormData) => {
    console.log('Form submitted with data:', formData);
    
    // Prepare data for API
    const apiData: any = {
      name: formData.name,
      description: formData.description || "",
      startDate: formData.startDate,
      endDate: formData.endDate,
      groupId: formData.groupId,
      status: formData.status || "planning",
      startLocation: formData.startLocation,
      destination: formData.endLocation, // Map endLocation from form to destination in API
      enableMobileNotifications: formData.enableMobileNotifications || false,
    };
    
    // Submit the data
    mutation.mutate(apiData);
  };
  
  const handleCancel = () => {
    navigate("/trips");
  };
  
  return (
    <AppShell>
      <div className="container mx-auto py-6 max-w-6xl">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            className="mr-2" 
            onClick={() => navigate("/trips")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
        </div>
        
        {/* Only show tabs when editing an existing event */}
        {eventId ? (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
            <TabsList>
              <TabsTrigger value="form">Edit Event</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="check-in">Check-in</TabsTrigger>
              <TabsTrigger value="tracking">Tracking</TabsTrigger>
            </TabsList>
            
            <TabsContent value="form">
              {isLoadingEvent ? (
                <div className="flex flex-col space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-64 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <UnifiedTripForm
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  defaultValues={defaultValues}
                  isLoading={isLoading}
                  isEditing={!!eventId}
                  tripType="event"
                  isSubmitting={mutation.isPending}
                  groupMembers={groupMembers}
                />
              )}
            </TabsContent>

            <TabsContent value="preview">
              {isLoadingEvent ? (
                <div className="flex flex-col space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                  <div className="p-6">
                    <h2 className="text-2xl font-bold mb-2">{eventData?.name}</h2>
                    {eventData?.startLocationDisplay && (
                      <div className="flex items-center text-gray-600 mb-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        {eventData.startLocationDisplay}
                      </div>
                    )}
                    <p className="text-gray-600 mb-4">
                      Status: <span className="font-semibold">{eventData?.status}</span>
                    </p>
                    <p className="mb-4">{eventData?.description}</p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                      <div className="bg-gray-50 p-4 rounded-lg flex-1">
                        <h3 className="font-semibold mb-2">Start</h3>
                        <p>{eventData?.startDate ? new Date(eventData.startDate).toLocaleDateString() : ""}</p>
                        <p>{eventData?.startDate ? formatTime(new Date(eventData.startDate)) : ""}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg flex-1">
                        <h3 className="font-semibold mb-2">End</h3>
                        <p>{eventData?.endDate ? new Date(eventData.endDate).toLocaleDateString() : ""}</p>
                        <p>{eventData?.endDate ? formatTime(new Date(eventData.endDate)) : ""}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="check-in">
              {eventData ? (
                <>
                  <TripCheckIn 
                    tripId={parseInt(eventId)} 
                    accessLevel={eventData._accessLevel || undefined}
                    tripStatus={eventData.status || undefined}
                  />
                  <div className="mt-8">
                    <TripCheckInStatus tripId={parseInt(eventId)} />
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <h3 className="text-lg font-medium">Loading check-in information...</h3>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="tracking">
              {eventData ? (
                <TripTracking 
                  tripId={parseInt(eventId)} 
                  tripName={eventData.name} 
                  isActive={activeTab === "tracking"} 
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <h3 className="text-lg font-medium">Loading tracking information...</h3>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          // When creating a new event, just show the form
          <UnifiedTripForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            defaultValues={{}} 
            isLoading={isLoading}
            tripType="event"
          />
        )}
      </div>
    </AppShell>
  );
}