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
import { ArrowLeft, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Trip, ItineraryItem } from "@shared/schema";
import { UnifiedTripForm } from "@/components/trips/unified-trip-form";

export default function ScheduleDetailsPage() {
  const [location, navigate] = useLocation();
  const params = useParams();
  const scheduleId = params.scheduleId;
  const queryClient = useQueryClient();
  
  // Function to determine the active tab from URL parameters
  const getTabFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    // Valid tab specified in URL
    if (tabParam && ["form", "preview", "check-in", "tracking"].includes(tabParam)) {
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

  // Query for existing trip data
  const { data: tripData, isLoading: isLoadingTrip } = useQuery<ExtendedTrip | undefined>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0")],
    enabled: !!scheduleId,
  });
  
  // Query for itinerary items
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0"), "itinerary"],
    enabled: !!scheduleId,
  });
  
  // Query for group members if the schedule belongs to a group
  const { data: groupMembersData } = useQuery({
    queryKey: [`/api/groups/${tripData?.groupId}/members`],
    enabled: !!tripData?.groupId,
  });
  
  // Loading state for the page
  if (isLoadingTrip) {
    return (
      <AppShell>
        <div className="container py-6">
          <h1 className="text-2xl font-bold mb-6">Loading Schedule Details...</h1>
        </div>
      </AppShell>
    );
  }
  
  // Error state if trip data isn't found
  if (!tripData && !isLoadingTrip) {
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
            <TabsList className="grid w-[800px] grid-cols-4 mx-auto mb-4">
              <TabsTrigger 
                value="preview" 
                data-active={activeTab === "preview"}
                className={activeTab === "preview" ? "data-[state=active]:bg-primary-500" : ""}
              >
                Preview
              </TabsTrigger>
              <TabsTrigger 
                value="form" 
                data-active={activeTab === "form"}
                className={activeTab === "form" ? "data-[state=active]:bg-primary-500" : ""}
              >
                Edit Schedule
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
            
            <TabsContent value="preview" className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h2 className="text-xl font-bold mb-4">{tripData?.name}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Start Location</p>
                    <p className="font-medium">{tripData?.startLocationDisplay || tripData?.startLocation}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Destination</p>
                    <p className="font-medium">{tripData?.destinationDisplay || tripData?.destination}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-medium capitalize">{tripData?.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Group</p>
                    <p className="font-medium">{tripData?.groupId ? "Group Schedule" : "Personal Schedule"}</p>
                  </div>
                </div>
                {tripData?.description && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="mt-1">{tripData.description}</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="form" className="space-y-4">
              <UnifiedTripForm 
                existingTrip={tripData}
                existingItinerary={itineraryItems}
              />
            </TabsContent>
            
            <TabsContent value="check-in" className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h2 className="text-xl font-bold mb-4">Schedule Check-In</h2>
                <p className="mb-6">Use this page to check in for your schedule.</p>
                
                <div className="bg-green-50 p-4 rounded-md mb-6">
                  <h3 className="font-semibold mb-2">Meeting Point</h3>
                  <p>{tripData?.startLocationDisplay || tripData?.startLocation}</p>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={() => {
                    navigate(`/check-in?tripId=${scheduleId}`);
                  }}
                >
                  Go to Check-In Page
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="tracking" className="space-y-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h2 className="text-xl font-bold mb-4">Schedule Tracking</h2>
                <p className="mb-6">This feature allows you to track the progress of your active schedule.</p>
                
                {tripData?.status === "in-progress" ? (
                  <div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500">Current Status</p>
                      <p className="font-medium capitalize">{tripData.status}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500">From</p>
                      <p className="font-medium">{tripData.startLocationDisplay || tripData.startLocation}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-gray-500">To</p>
                      <p className="font-medium">{tripData.destinationDisplay || tripData.destination}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-600 p-4 bg-amber-50 rounded-md">
                    This schedule is not currently in progress. Tracking is only available for schedules that are in progress.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}