import { useToast } from "@/hooks/use-toast";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trip, ItineraryItem } from "@shared/schema";

// Helper function to safely parse JSON strings or return a default value
function tryParseJSON(jsonString: string | null | undefined, defaultValue: any = []) {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON string:", jsonString);
    // If it's not valid JSON and it's a string, treat it as a comma-separated string
    if (typeof jsonString === 'string') {
      return jsonString.split(',');
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
  const [, navigate] = useLocation();
  const params = useParams();
  const tripId = params.tripId;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("form");
  
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
      const stops = itineraryItems.map((item) => {
        // Convert recurrencePattern to one of the valid values
        let pattern = item.recurrencePattern;
        if (pattern && !["daily", "weekly", "monthly", "custom"].includes(pattern)) {
          pattern = "custom"; // Default to custom if it's not one of the expected values
        }
        
        return {
          day: item.day,
          title: item.title || "",
          startLocation: item.fromLocation || "",
          endLocation: item.toLocation || "",
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
        formData.startLocation = item.fromLocation || tripData.startLocation || "";
        formData.endLocation = item.toLocation || tripData.destination || "";
        formData.startTime = item.startTime || "";
        formData.endTime = item.endTime || "";
        formData.isRecurring = item.isRecurring || false;
        
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
    // Format data for the API
    if (data.isMultiStop) {
      // For multi-stop trips, we need to:
      // 1. Update the trip record with basic info
      // 2. Create/update itinerary items for each stop
      const tripData = {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        startLocation: data.stops[0]?.startLocation || "",
        destination: data.stops[data.stops.length - 1]?.endLocation || "",
        groupId: data.groupId,
        // Update itinerary items separately via API
        itineraryItems: data.stops.map((stop: any) => ({
          day: stop.day,
          title: stop.title,
          description: stop.description || "",
          fromLocation: stop.startLocation,
          toLocation: stop.endLocation,
          startTime: stop.startTime || "",
          endTime: stop.endTime || "",
          isRecurring: false, // Multi-stop trips don't support recurrence per stop
          recurrencePattern: null,
          recurrenceDays: null,
        })),
      };
      
      mutation.mutate(tripData);
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
        startLocation: data.startLocation,
        destination: data.endLocation,
        groupId: data.groupId,
        // Create a single itinerary item
        itineraryItems: [{
          day: 1,
          title: data.name,
          description: data.description || "",
          fromLocation: data.startLocation,
          toLocation: data.endLocation,
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-[400px] grid-cols-2 mx-auto mb-4">
                <TabsTrigger value="form">Edit Trip</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
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