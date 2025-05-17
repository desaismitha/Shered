// Use React.lazy for dynamic imports
import React, { useEffect, useState, Suspense } from "react";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, FileText, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Trip, ItineraryItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  // Initialize basic state immediately
  const [location, navigate] = useLocation();
  const params = useParams();
  const scheduleId = params.scheduleId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("preview");
  
  // Parse URL parameters for active tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ["form", "preview", "check-in", "tracking", "drivers", "requests"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [window.location.search]);
  
  // Function to handle tab changes from the UI
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newUrl = `/schedules/${scheduleId}?tab=${tab}`;
    navigate(newUrl, { replace: true });
  };
  
  // Get schedule data with optimized query settings
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<Trip & { _accessLevel?: 'owner' | 'member'; startLocationDisplay?: string; destinationDisplay?: string; }>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0")],
    enabled: !!scheduleId,
    staleTime: 600000, // 10 minutes
    gcTime: 900000, // 15 minutes
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst', // Use cached data first
    retry: false, // Don't retry failed requests for faster initial load
  });

  // Only load itinerary when explicitly needed - we'll skip this for initial load
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

  // Show loading state
  if (isLoadingTrip) {
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
  
  // Show error state if data isn't found
  if (!tripData) {
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

  // Handle form submission
  const handleFormSubmit = async (data: any) => {
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
      
      // Make the API request to update the schedule
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update schedule');
      }
      
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
        queryClient.invalidateQueries({ queryKey: ["/api/schedules", parseInt(scheduleId || "0")] });
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