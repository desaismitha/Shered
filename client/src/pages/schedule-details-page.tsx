// Optimized imports
import React, { useEffect, useState, Suspense, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQueryClient, useQuery, UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, MapPin, FileText, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Trip, ItineraryItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

// Lazy load heavy components to improve initial page load
const UnifiedTripForm = React.lazy(() => 
  import("@/components/trips/unified-trip-form").then(mod => ({ default: mod.UnifiedTripForm }))
);
const ModificationRequestsTab = React.lazy(() => 
  import("@/components/trips/modification-requests-tab").then(mod => ({ default: mod.ModificationRequestsTab }))
);
const DriverAssignmentsTab = React.lazy(() => 
  import("@/components/trips/driver-assignments-tab").then(mod => ({ default: mod.DriverAssignmentsTab }))
);

export default function ScheduleDetailsPage() {
  // Use refs to avoid unnecessary re-renders 
  const firstRender = useRef(true);
  const [location, navigate] = useLocation();
  const params = useParams();
  const scheduleId = params.scheduleId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("preview");
  
  // Check for cached data first (fast render path)
  const cachedData = queryClient.getQueryData<Trip>(["/api/schedules", parseInt(scheduleId || "0")]) || 
                    (queryClient.getQueryData<Trip[]>(["/api/schedules"])?.find(s => 
                      s.id === parseInt(scheduleId || "0")));
                      
  // If we have cached data, we can skip the loading state (instant render)
  const skipLoadingState = !!cachedData;
  
  // Directly fetch data without using React Query hooks initially 
  // to avoid the component rendering twice when data changes
  if (firstRender.current && !cachedData && scheduleId) {
    firstRender.current = false;
    // Make a direct fetch and update the cache
    fetch(`/api/schedules/${scheduleId}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        queryClient.setQueryData(["/api/schedules", parseInt(scheduleId)], data);
      })
      .catch(err => console.error("Error prefetching data:", err));
  }
                      
  // Parse URL parameters for active tab (only once on mount)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ["form", "preview", "check-in", "tracking", "drivers", "requests"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);
  
  // Function to handle tab changes from the UI (minimized)
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newUrl = `/schedules/${scheduleId}?tab=${tab}`;
    navigate(newUrl, { replace: true });
  };
  
  // Store error state for more reliable UI
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Safely type our trip data to avoid TypeScript errors
  type TripDataType = Trip & { 
    _accessLevel?: 'owner' | 'member'; 
    startLocationDisplay?: string; 
    destinationDisplay?: string; 
  };
  
  // Get schedule data with robust error handling
  const { data: tripData, isLoading: isLoadingTrip, error } = useQuery<TripDataType>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0")],
    enabled: !!scheduleId,
    staleTime: 600000, // 10 minutes
    gcTime: 1800000, // 30 minutes 
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount to prevent flicker
    networkMode: 'offlineFirst', // Use cached data first
    initialData: cachedData as TripDataType, // Use cached data immediately
    retry: 2 // Retry twice on failure
  });
  
  // Handle errors through the useEffect pattern instead of callback
  useEffect(() => {
    if (error) {
      console.error("Error loading schedule details:", error);
      setHasError(true);
      setErrorMsg((error as Error)?.message || "Database connection issue. Using cached data if available.");
    }
  }, [error]);

  // Skip itinerary loading for better performance
  const { data: itineraryItems } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0"), "itinerary"],
    enabled: false, // Disable automatic loading
    staleTime: 300000,
    gcTime: 600000,
    refetchOnWindowFocus: false,
  });

  // Determine page title
  const getPageTitle = () => {
    switch (activeTab) {
      case "form": return "Edit Schedule";
      case "preview": return "Schedule Details";
      case "check-in": return "Schedule Check-In";
      case "tracking": return "Schedule Tracking";
      case "requests": return "Modification Requests";
      default: return "Schedule Details";
    }
  };

  // Function to render simplified schedule details based on minimal data
  // This is a fast path that doesn't use any heavy components or nested data
  const renderSimplifiedDetails = (scheduleData: any) => {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-xl font-semibold mb-4">{scheduleData?.name || "Loading..."}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Start Location</p>
            <p className="font-medium">{scheduleData?.startLocationDisplay || scheduleData?.startLocation?.split('[')[0].trim() || "..."}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Destination</p>
            <p className="font-medium">{scheduleData?.destinationDisplay || scheduleData?.destination?.split('[')[0].trim() || "..."}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium capitalize">{scheduleData?.status || "..."}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Group</p>
            <p className="font-medium">{scheduleData?.groupId ? "Group Schedule" : "Personal Schedule"}</p>
          </div>
        </div>
        {scheduleData?.description && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Description</p>
            <p className="mt-1">{scheduleData.description}</p>
          </div>
        )}
      </div>
    );
  }

  // Ultra-fast loading state that appears immediately
  if (isLoadingTrip && !cachedData) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/schedules")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold ml-2">Loading Schedule...</h1>
          </div>
          
          <div className="max-w-5xl mx-auto">
            {/* Main content skeleton - simplified for faster rendering */}
            <div className="bg-white p-6 rounded-lg shadow-sm border animate-pulse">
              <div className="h-7 w-1/3 bg-gray-200 rounded mb-6"></div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-5 w-2/3 bg-gray-200 rounded"></div>
                </div>
                <div>
                  <div className="h-4 w-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-5 w-2/3 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
  
  // Fast path for cached data to show immediately while full data loads
  if (isLoadingTrip && cachedData) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/schedules")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold ml-2">Schedule Details</h1>
          </div>
          
          <div className="max-w-5xl mx-auto">
            {renderSimplifiedDetails(cachedData)}
            <div className="text-center text-sm text-muted-foreground">
              Loading complete details...
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
  
  // Show error state if data isn't found - but only if we don't have cached data
  if (!tripData && !cachedData) {
    return (
      <AppShell>
        <div className="container py-6">
          <h1 className="text-2xl font-bold mb-6">Schedule Not Found</h1>
          <p>The schedule you're looking for doesn't exist or you don't have permission to view it.</p>
          <Button className="mt-4" onClick={() => navigate("/schedules")}>
            Back to Schedules
          </Button>
        </div>
      </AppShell>
    );
  }
  
  // Show cached data with error message if DB connection failed but we have cached data
  if (hasError && cachedData) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="flex items-center mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/schedules")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold ml-2">Schedule Details</h1>
          </div>
          
          <div className="max-w-5xl mx-auto">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-md mb-6">
              <p className="text-amber-800">
                <strong>Note:</strong> {errorMsg} Showing cached data instead.
              </p>
            </div>
            
            {renderSimplifiedDetails(cachedData)}
            
            <div className="flex justify-center mt-6">
              <Button onClick={() => navigate("/schedules")}>
                Return to Schedules List
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Handle form submission with built-in error handling
  const handleFormSubmit = async (data: any) => {
    if (!scheduleId) return;
    
    try {
      setIsSubmitting(true);
      
      // Format dates combining the date and time
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      
      const [startHours, startMinutes] = data.startTime.split(':').map(Number);
      const [endHours, endMinutes] = data.endTime.split(':').map(Number);
      
      startDate.setHours(startHours, startMinutes);
      endDate.setHours(endHours, endMinutes);
      
      // Prepare the data to update
      const updateData = {
        name: data.name,
        description: data.description,
        startLocation: data.startLocation,
        destination: data.endLocation,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: data.status,
        groupId: data.groupId || null,
        enableMobileNotifications: data.enableMobileNotifications
      };
      
      // Use the apiRequest helper for better error handling
      await apiRequest('PATCH', `/api/schedules/${scheduleId}`, updateData);
      
      // Show success notification
      toast({
        title: "Schedule updated",
        description: "Your schedule has been updated successfully.",
        variant: "default"
      });
      
      // Switch to preview tab immediately
      setActiveTab("preview");
      
      // Refresh data in the background after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/schedules", parseInt(scheduleId)] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      }, 100);
    } catch (error: any) {
      console.error('Error updating schedule:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update schedule. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Main content
  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/schedules")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold ml-2">{getPageTitle()}</h1>
        </div>
        
        <div className="max-w-5xl mx-auto">
          <Tabs 
            value={activeTab} 
            onValueChange={handleTabChange} 
            className="w-full"
          >
            <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto mb-4">
              <TabsTrigger 
                value="preview" 
                className={activeTab === "preview" ? "data-[state=active]:bg-primary-500" : ""}
              >
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>View Details</span>
                </div>
              </TabsTrigger>
              
              <TabsTrigger 
                value="form" 
                className={activeTab === "form" ? "data-[state=active]:bg-primary-500" : ""}
                disabled={!isAdmin()}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span>Edit Schedule</span>
                </div>
              </TabsTrigger>

              {isAdmin() && (
                <TabsTrigger 
                  value="requests" 
                  className={`col-span-2 mt-2 ${activeTab === "requests" ? "data-[state=active]:bg-primary-500" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>Modification Requests</span>
                  </div>
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="preview" className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h2 className="text-xl font-bold mb-4">{tripData.name}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Start Location</p>
                    <p className="font-medium">{tripData.startLocationDisplay || tripData.startLocation}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Destination</p>
                    <p className="font-medium">{tripData.destinationDisplay || tripData.destination}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-medium capitalize">{tripData.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Group</p>
                    <p className="font-medium">{tripData.groupId ? "Group Schedule" : "Personal Schedule"}</p>
                  </div>
                </div>
                {tripData.description && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="mt-1">{tripData.description}</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="form" className="space-y-4">
              {activeTab === "form" && (
                <Suspense fallback={
                  <div className="p-6 bg-white rounded-lg shadow-sm animate-pulse">
                    <div className="h-8 w-1/3 bg-gray-200 rounded mb-6"></div>
                    <div className="space-y-4">
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                }>
                  <UnifiedTripForm 
                    defaultValues={{
                      name: tripData.name || "",
                      description: tripData.description || "",
                      startDate: tripData.startDate ? new Date(tripData.startDate) : new Date(),
                      endDate: tripData.endDate ? new Date(tripData.endDate) : new Date(),
                      groupId: tripData.groupId || undefined,
                      startLocation: tripData.startLocation || "",
                      endLocation: tripData.destination || "",
                      status: (tripData.status as any) || "planning",
                      enableMobileNotifications: tripData.enableMobileNotifications || false,
                      startTime: tripData.startDate 
                        ? new Date(tripData.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})
                        : "09:00",
                      endTime: tripData.endDate
                        ? new Date(tripData.endDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})
                        : "17:00"
                    }}
                    isEditing={true}
                    isLoading={isSubmitting}
                    onSubmit={handleFormSubmit}
                  />
                </Suspense>
              )}
            </TabsContent>

            <TabsContent value="requests" className="space-y-4">
              {activeTab === "requests" && isAdmin() && (
                <Suspense fallback={
                  <div className="p-6 bg-white rounded-lg shadow-sm animate-pulse">
                    <div className="h-7 w-2/3 bg-gray-200 rounded mb-4"></div>
                    <div className="space-y-3">
                      <div className="h-12 bg-gray-200 rounded"></div>
                      <div className="h-12 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                }>
                  <ModificationRequestsTab tripId={parseInt(scheduleId || "0")} tripName={tripData?.name || ""} />
                </Suspense>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}