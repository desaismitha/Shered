import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, FileText, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Trip, ItineraryItem } from "@shared/schema";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";
import { useToast } from "@/hooks/use-toast";
import { ScheduleDetailsSkeleton } from "@/components/ui/loading-fallback";
import { useAuth } from "@/hooks/use-auth";
import { ModificationRequestsTab } from "@/components/trips/modification-requests-tab";
import { DriverAssignmentsTab } from "@/components/trips/driver-assignments-tab";

export default function ScheduleDetailsPage() {
  // Show initial content immediately to prevent blank screen
  useEffect(() => {
    // Set a minimal delay to ensure DOM is ready
    document.body.style.opacity = "1";
  }, []);

  const [location, navigate] = useLocation();
  const params = useParams();
  const scheduleId = params.scheduleId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Function to determine the active tab from URL parameters
  const getTabFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    // Valid tab specified in URL
    if (tabParam && ["form", "preview", "check-in", "tracking", "drivers", "requests"].includes(tabParam)) {
      return tabParam;
    }
    
    // Default to preview tab
    return "preview";
  };
  
  // State to track the active tab
  const [activeTab, setActiveTab] = useState<string>(getTabFromUrl());
  
  // Update tab when URL changes
  useEffect(() => {
    const newTab = getTabFromUrl();
    console.log(`Setting active tab to: ${newTab} (from URL)`); 
    setActiveTab(newTab);
  }, [window.location.search]);
  
  // Function to handle tab changes from the UI
  const handleTabChange = (tab: string) => {
    console.log(`Tab changed to: ${tab} (from UI interaction)`);
    setActiveTab(tab);
    
    // Update the URL to reflect the tab change
    const newUrl = `/schedules/${scheduleId}?tab=${tab}`;
    console.log(`Updating URL to: ${newUrl}`);
    navigate(newUrl, { replace: true });
  };
  
  // Define extended Trip type with _accessLevel
  type ExtendedTrip = Trip & { _accessLevel?: 'owner' | 'member'; startLocationDisplay?: string; destinationDisplay?: string; };

  // Query for existing trip data with better optimized parameters
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<ExtendedTrip>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0")],
    enabled: !!scheduleId && scheduleId !== "0",
    staleTime: 300000, // Data stays fresh for 5 minutes
    gcTime: 600000, // Cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    retry: 1, // Only retry once to prevent excessive API calls
  });
  
  // Only load itinerary items when in preview tab to reduce initial load time
  const shouldLoadItinerary = activeTab === "preview" || activeTab === "tracking";
  
  // Query for itinerary items with better optimized parameters
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0"), "itinerary"],
    enabled: !!scheduleId && !!tripData && shouldLoadItinerary,
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
    refetchOnWindowFocus: false,
  });
  
  // Query for group members only when needed and when trip data is loaded
  // This prevents unnecessary API calls
  const needsGroupMembers = activeTab === "drivers" || (isAdmin() && activeTab === "requests");
  
  const { data: groupMembersData } = useQuery<any[]>({
    queryKey: ["/api/groups", tripData?.groupId, "members"],
    enabled: !!tripData?.groupId && needsGroupMembers,
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 1, // Only retry once to prevent excessive API calls
  });
  
  // Determine page title based on active tab
  const getPageTitle = () => {
    switch (activeTab) {
      case "form": return "Edit Schedule";
      case "preview": return "Schedule Details";
      case "check-in": return "Schedule Check-In";
      case "tracking": return "Schedule Tracking";
      default: return "Schedule Details";
    }
  };

// Pre-render the basic layout structure while data is loading
  if (isLoadingTrip) {
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
                Schedule Details
              </h1>
            </div>
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
                <div>
                  <div className="h-4 w-16 bg-gray-200 rounded mb-2"></div>
                  <div className="h-5 w-24 bg-gray-200 rounded"></div>
                </div>
                <div>
                  <div className="h-4 w-16 bg-gray-200 rounded mb-2"></div>
                  <div className="h-5 w-36 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
  
  return (
    <AppShell>
      <div className="container py-6">
        {!tripData ? (
          // Error state if trip data isn't found
          <>
            <h1 className="text-2xl font-bold mb-6">Schedule Not Found</h1>
            <p>The schedule you're looking for doesn't exist or you don't have permission to view it.</p>
            <Button className="mt-4" onClick={() => navigate("/schedules")}>
              Back to Schedules
            </Button>
          </>
        ) : (
          // Content when data is loaded successfully
          <>
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
                  {getPageTitle()}
                </h1>
              </div>
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
                    data-active={activeTab === "preview"}
                    className={activeTab === "preview" ? "data-[state=active]:bg-primary-500" : ""}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      <span>View Details</span>
                    </div>
                  </TabsTrigger>
                  
                  <TabsTrigger 
                    value="form" 
                    data-active={activeTab === "form"}
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
                      data-active={activeTab === "requests"}
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
                    onSubmit={async (data) => {
                      console.log("Form submitted with data:", data);
                      
                      setIsSubmitting(true);
                      
                      try {
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
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify(updateData)
                        });
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          throw new Error(errorText || 'Failed to update schedule');
                        }
                        
                        // Show success notification immediately for better perceived performance
                        toast({
                          title: "Schedule updated",
                          description: "Your schedule has been updated successfully.",
                          variant: "default"
                        });
                        
                        // Switch to preview tab first for immediate feedback
                        setActiveTab("preview");
                        
                        // Then update data in the background
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
                    }}
                  />
                </TabsContent>
                

                

                
                {isAdmin() && (
                  <TabsContent value="requests" className="space-y-4">
                    <ModificationRequestsTab tripId={parseInt(scheduleId || "0")} tripName={tripData?.name || ""} />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}