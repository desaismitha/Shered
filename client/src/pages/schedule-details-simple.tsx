// Simple imports
import React, { useEffect, useState, Suspense } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trip } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Lazy load the form component
const UnifiedTripForm = React.lazy(() =>
  import("@/components/trips/unified-trip-form").then((mod) => ({
    default: mod.UnifiedTripForm,
  }))
);

// Simple schedule details display component
function ScheduleDetailsView({ schedule }: { schedule: any }) {
  if (!schedule) {
    return <div>No schedule data available</div>;
  }

  const startLocation = schedule.startLocationDisplay || 
    (schedule.startLocation ? schedule.startLocation.split("[")[0].trim() : "Not specified");
  
  const destination = schedule.destinationDisplay || 
    (schedule.destination ? schedule.destination.split("[")[0].trim() : "Not specified");

  // Format dates
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
      <h2 className="text-xl font-semibold mb-4">{schedule.name}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">Start Location</p>
          <p className="font-medium">{startLocation}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Destination</p>
          <p className="font-medium">{destination}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Start Date & Time</p>
          <p className="font-medium">{formatDate(schedule.startDate)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">End Date & Time</p>
          <p className="font-medium">{formatDate(schedule.endDate)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Status</p>
          <p className="font-medium capitalize">{schedule.status}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Type</p>
          <p className="font-medium">{schedule.groupId ? "Group Schedule" : "Personal Schedule"}</p>
        </div>
      </div>
      
      {schedule.description && (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Description</p>
          <p className="mt-1">{schedule.description}</p>
        </div>
      )}
    </div>
  );
}

// Simple loading component
function LoadingState() {
  return (
    <div className="flex justify-center items-center py-10">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-t-primary border-r-primary border-b-primary-100 border-l-primary-100 rounded-full animate-spin inline-block mb-2"></div>
        <p>Loading schedule details...</p>
      </div>
    </div>
  );
}

export default function ScheduleDetailsSimplePage() {
  // Basic state
  const [activeTab, setActiveTab] = useState("preview");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, navigate] = useLocation();
  const params = useParams();
  const scheduleId = params.scheduleId;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();

  // Parse URL parameters for active tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam && ["form", "preview"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  // Function to handle tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newUrl = `/schedules/${scheduleId}?tab=${tab}`;
    navigate(newUrl, { replace: true });
  };

  // Simple data fetching
  const { 
    data: schedule, 
    isLoading,
    error
  } = useQuery({
    queryKey: ["/api/schedules", parseInt(scheduleId || "0")],
    enabled: !!scheduleId,
  });

  // Form submission handler
  const handleFormSubmit = async (data: any) => {
    if (!scheduleId) return;

    try {
      setIsSubmitting(true);

      // Format dates combining the date and time
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);

      const [startHours, startMinutes] = data.startTime.split(":").map(Number);
      const [endHours, endMinutes] = data.endTime.split(":").map(Number);

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
        enableMobileNotifications: data.enableMobileNotifications,
      };

      await apiRequest("PATCH", `/api/schedules/${scheduleId}`, updateData);

      toast({
        title: "Schedule updated",
        description: "Your schedule has been updated successfully."
      });

      // Switch to preview tab
      setActiveTab("preview");

      // Refresh data
      queryClient.invalidateQueries({
        queryKey: ["/api/schedules", parseInt(scheduleId)],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
    } catch (error: any) {
      console.error("Error updating schedule:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update schedule",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Error state
  if (error) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="flex items-center mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/schedules")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold ml-2">Error</h1>
          </div>
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600">
            <p>Failed to load schedule details. Please try again.</p>
          </div>
          <Button className="mt-4" onClick={() => navigate("/schedules")}>
            Back to Schedules
          </Button>
        </div>
      </AppShell>
    );
  }

  // Main content
  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/schedules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold ml-2">
            {activeTab === "preview" ? "Schedule Details" : "Edit Schedule"}
          </h1>
        </div>

        <div className="max-w-5xl mx-auto">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
            </TabsList>

            <TabsContent value="preview">
              {isLoading ? (
                <LoadingState />
              ) : (
                <ScheduleDetailsView schedule={schedule} />
              )}
            </TabsContent>

            <TabsContent value="form">
              {isLoading ? (
                <LoadingState />
              ) : (
                schedule && isAdmin() && (
                  <Suspense fallback={<LoadingState />}>
                    <UnifiedTripForm
                      initialData={schedule}
                      onSubmit={handleFormSubmit}
                      isSubmitting={isSubmitting}
                    />
                  </Suspense>
                )
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}