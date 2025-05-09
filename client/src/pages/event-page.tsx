import { useToast } from "@/hooks/use-toast";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Trip, ItineraryItem } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

// Define an extended type for form data structure
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
      const validTabs = ["form", "preview"];
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

  // Query for existing trip if editing
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<ExtendedTrip | undefined>({
    queryKey: eventId ? ["/api/trips", parseInt(eventId)] : (["/api/trips", "no-id"] as const),
    enabled: !!eventId,
  });
  
  // Query for itinerary items if editing a trip
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: eventId ? ["/api/trips", parseInt(eventId), "itinerary"] : (["/api/trips", "no-id", "itinerary"] as const),
    enabled: !!eventId,
  });
  
  // Query for group members if the trip belongs to a group
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
    if (!groupMembersData || !users) return [];
    
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
        }).filter(Boolean)
      : [];
    
    return membersList;
  }, [groupMembersData, users]);
  
  // Mutation for creating/updating events
  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log('MUTATION START - Form data received:', formData);
      if (eventId) {
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
        // Create new event (using the trips endpoint)
        const res = await apiRequest("POST", "/api/trips", formData);
        return await res.json();
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
      endTime: defaultEndTime,
      enableMobileNotifications: tripData.enableMobileNotifications || false
    };
    
    // If we have itinerary items, populate the stops array for multi-stop trips
    if (itineraryItems && itineraryItems.length > 0) {
      formData.isMultiStop = true;
      formData.stops = [];
      
      // Map itinerary items to stops
      itineraryItems.forEach((item, index) => {
        // Process each itinerary item
        formData.stops.push({
          id: item.id,
          day: item.day,
          title: item.title || "",
          startLocation: item.fromLocation || "",
          endLocation: item.toLocation || "",
          startTime: item.startTime || "",
          endTime: item.endTime || "",
          description: item.description || "",
          isRecurring: item.isRecurring || false,
          recurrencePattern: item.recurrencePattern,
          recurrenceDays: item.recurrenceDays ? tryParseJSON(item.recurrenceDays as string) : []
        });
      });
    }
    
    return formData;
  };

  // Extract initial values for the form or an empty object
  const defaultFormValues = tripData ? prepareFormData() : {};
  
  // Log the default values to help with form debugging
  React.useEffect(() => {
    console.log("Form component default values:", defaultFormValues);
  }, [tripData]);
  
  // Pass the extracted form values to the UnifiedTripForm component
  return (
    <AppShell>
      <div className="container py-6">
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            className="mb-6"
            onClick={() => navigate("/trips")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Trips
          </Button>
          
          <h1 className="text-3xl font-bold tracking-tight">
            {eventId ? "Edit Event" : "Create New Event"}
          </h1>
          <p className="text-muted-foreground">
            Create and manage events for your groups.
          </p>
        </div>
        
        {/* Main content area */}
        <div className="space-y-6">
          {/* Show a loading state while data is being fetched */}
          {eventId && (isLoadingTrip || isLoadingItinerary) ? (
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Loading event details...</p>
            </div>
          ) : (
            <>
              {/* Tabs for different sections (form and preview) */}
              {eventId && (
                <Tabs
                  defaultValue={activeTab}
                  value={activeTab}
                  onValueChange={handleTabChange}
                  className="w-full"
                >
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="form">Edit</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="form" className="mt-4">
                    <UnifiedTripForm
                      defaultValues={defaultFormValues}
                      onSubmit={(data) => {
                        console.log("Form submitted with data:", data);
                        mutation.mutate(data);
                      }}
                      isSubmitting={mutation.isPending}
                      tripType="event"
                      groupMembers={groupMembers}
                    />
                  </TabsContent>
                  
                  <TabsContent value="preview" className="mt-4">
                    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
                      <h3 className="text-lg font-semibold mb-4">Event Preview</h3>
                      
                      {tripData ? (
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm text-muted-foreground">Event Name</h4>
                            <p className="text-lg">{tripData.name}</p>
                          </div>
                          
                          {tripData.description && (
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground">Description</h4>
                              <p>{tripData.description}</p>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground">Start</h4>
                              <p>{new Date(tripData.startDate).toLocaleString()}</p>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground">End</h4>
                              <p>{new Date(tripData.endDate).toLocaleString()}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground">Location</h4>
                              <p>{tripData.startLocationDisplay || tripData.startLocation}</p>
                            </div>
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground">Destination</h4>
                              <p>{tripData.destinationDisplay || tripData.destination}</p>
                            </div>
                          </div>
                          
                          {itineraryItems && itineraryItems.length > 0 && (
                            <div>
                              <h4 className="font-medium text-sm text-muted-foreground mb-2">Itinerary</h4>
                              <ul className="space-y-2">
                                {itineraryItems.map((item) => (
                                  <li key={item.id} className="p-3 rounded-md bg-muted/50">
                                    <div className="font-medium">{item.title}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {item.fromLocation && <span>From: {item.fromLocation}</span>}
                                      {item.toLocation && <span> • To: {item.toLocation}</span>}
                                    </div>
                                    {item.description && <div className="mt-1 text-sm">{item.description}</div>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p>No preview data available.</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
              
              {/* Show the form directly when creating a new event */}
              {!eventId && (
                <UnifiedTripForm
                  defaultValues={{
                    enableMobileNotifications: true
                  }}
                  onSubmit={(data) => {
                    console.log("Form submitted with data:", data);
                    mutation.mutate(data);
                  }}
                  isSubmitting={mutation.isPending}
                  tripType="event"
                  groupMembers={[]}
                />
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}