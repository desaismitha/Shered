import { useToast } from "@/hooks/use-toast";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trip, ItineraryItem } from "@shared/schema";
import { TripCheckIn } from "@/components/trips/trip-check-in";

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
  
  // Parse URL for tab parameter
  const getDefaultTab = () => {
    if (!tripId) return "form";
    
    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    const tabParam = searchParams.get('tab');
    
    // Check if the tab parameter is valid
    const validTabs = ["form", "preview", "check-in"];
    return validTabs.includes(tabParam || '') ? tabParam : "form";
  };
  
  const [activeTab, setActiveTab] = useState(getDefaultTab());
  
  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    
    // Update URL with the new tab parameter
    if (tripId) {
      const newLocation = `/trips/${tripId}?tab=${tab}`;
      window.history.replaceState(null, '', newLocation);
    }
  };
  
  // Query for existing trip if editing
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<Trip>({
    queryKey: tripId ? ["/api/trips", parseInt(tripId)] : (["/api/trips", "no-id"] as const),
    enabled: !!tripId,
  });
  
  // Query for itinerary items if editing a trip
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: tripId ? ["/api/trips", parseInt(tripId), "itinerary"] : (["/api/trips", "no-id", "itinerary"] as const),
    enabled: !!tripId,
  });
  
  // Mutation for creating/updating trips
  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      if (tripId) {
        // Update existing trip
        const res = await apiRequest("PATCH", `/api/trips/${tripId}`, formData);
        return await res.json();
      } else {
        // Create new trip
        const res = await apiRequest("POST", "/api/trips", formData);
        return await res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: tripId ? "Trip updated" : "Trip created",
        description: tripId 
          ? "Your trip has been updated successfully." 
          : "Your new trip has been created successfully.",
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
        console.log(`Navigating to ${targetUrl} after trip creation/update`);
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
        description: `Failed to ${tripId ? "update" : "create"} trip: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Transform data from existing trip + itinerary to match the unified form structure
  const prepareFormData = (): any => {
    if (!tripData) return {};
    
    console.log("Preparing form data with trip data:", tripData);
    console.log("Using itinerary items:", itineraryItems);
    
    // Start with basic trip data
    const formData: any = {
      name: tripData.name,
      description: tripData.description || "",
      startDate: new Date(tripData.startDate),
      endDate: new Date(tripData.endDate),
      groupId: tripData.groupId || undefined,
      status: tripData.status || "planning",
      // These fields are now part of the unified schema but might come from itinerary
      startLocation: tripData.startLocation || "",
      endLocation: tripData.destination || "",
      // Default to single stop if we don't have itinerary items
      isMultiStop: false,
      isRecurring: false,
      startTime: "",
      endTime: ""
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
        formData.startTime = item.startTime || "";
        formData.endTime = item.endTime || "";
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
    console.log("Submit form data:", data);
    
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
        status: data.status,
        startLocation: hasValidStops && data.stops[0]?.startLocation 
                      ? data.stops[0].startLocation 
                      : (tripData?.startLocation || data.startLocation || "Unknown location"),
        destination: hasValidStops && data.stops[data.stops.length - 1]?.endLocation 
                   ? data.stops[data.stops.length - 1].endLocation 
                   : (tripData?.destination || data.endLocation || "Unknown location"),
        groupId: data.groupId,
        // Update itinerary items separately via API
        itineraryItems: hasValidStops ? data.stops.map((stop: any) => {
          console.log(`Processing stop in submit: ${stop.title}, startLoc: ${stop.startLocation}, endLoc: ${stop.endLocation}`);
          
          return {
            day: stop.day,
            title: stop.title,
            description: stop.description || "",
            fromLocation: stop.startLocation || tripData?.startLocation || "Unknown location", // Never allow empty locations
            toLocation: stop.endLocation || tripData?.destination || "Unknown location",     // Never allow empty locations
            startTime: stop.startTime || "",
            endTime: stop.endTime || "",
            isRecurring: false, // Multi-stop trips don't support recurrence per stop
            recurrencePattern: null,
            recurrenceDays: null,
          };
        }) : (itineraryItems || []),
      };
      
      mutation.mutate(tripUpdateData);
    } else {
      // For single-stop trips, we create:
      // 1. A trip record with the basic trip info
      // 2. A single itinerary item for the start/end locations
      const tripData = {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        startLocation: data.startLocation || "Unknown location",
        destination: data.endLocation || "Unknown location",
        groupId: data.groupId,
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
      
      mutation.mutate(tripData);
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
              onClick={() => navigate("/trips")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              {tripId ? "Edit Trip" : "Create New Trip"}
            </h1>
          </div>
        </div>
        
        <div className="max-w-5xl mx-auto">
          {tripId ? (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-[600px] grid-cols-3 mx-auto mb-4">
                <TabsTrigger value="form">Edit Trip</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="check-in">Check-In</TabsTrigger>
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
                    onSubmit={handleSubmit}
                    defaultValues={defaultValues}
                    isLoading={mutation.isPending}
                    isEditing={true}
                    onCancel={() => navigate("/trips")}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="preview" className="mt-0">
                <div className="bg-muted p-6 rounded-lg">
                  <h2 className="text-xl font-medium mb-4">Trip Preview</h2>
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
                                        {item.startTime} - {item.endTime}
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
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="check-in" className="mt-0">
                <div className="bg-muted p-6 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <h2 className="text-xl font-medium">Trip Check-In</h2>
                  </div>
                  
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : tripData ? (
                    <TripCheckIn 
                      tripId={parseInt(tripId)} 
                      accessLevel={tripData._accessLevel || 'member'} 
                      tripStatus={tripData.status || 'planning'}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Trip data not available
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