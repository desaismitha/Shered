import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Trip } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  // Loading state
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Get schedules data
  const { 
    data = [], 
    isLoading, 
    refetch, 
    isError 
  } = useQuery<Trip[]>({
    queryKey: ["/api/schedules"]
  });

  // Filter schedules based on active tab and search query
  const filteredSchedules = data.filter(schedule => {
    // Skip invalid entries
    if (!schedule || !schedule.status) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const nameMatch = schedule.name?.toLowerCase().includes(query) || false;
      const destinationMatch = schedule.destination?.toLowerCase().includes(query) || false;
      const locationMatch = schedule.startLocation?.toLowerCase().includes(query) || false;
      
      if (!nameMatch && !destinationMatch && !locationMatch) {
        return false;
      }
    }
    
    // Tab filter
    const now = new Date();
    
    if (activeTab === "upcoming") {
      const activeStatuses = ["planning", "confirmed", "in-progress"];
      return activeStatuses.includes(schedule.status);
    } 
    else if (activeTab === "past") {
      return (
        schedule.status === "completed" || 
        (schedule.endDate && new Date(schedule.endDate) < now && 
         schedule.status !== "cancelled")
      );
    } 
    else if (activeTab === "cancelled") {
      return schedule.status === "cancelled";
    }
    
    return false;
  });

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Manual refresh with user feedback
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refetch();
      toast({
        title: "Schedules updated",
        description: "Latest data loaded successfully"
      });
    } catch (err) {
      toast({
        title: "Error refreshing",
        description: "Unable to fetch the latest data",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Error notification
  const ErrorMessage = isError && (
    <div className="bg-amber-50 border border-amber-200 p-4 rounded-md mb-6">
      <p className="text-amber-800">
        <strong>Note:</strong> There was an issue loading schedule data. 
        {data.length > 0 ? " Showing cached data." : " Please try refreshing."}
      </p>
    </div>
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">
              My Schedules
            </h1>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 w-9"
              title="Refresh schedules"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            <div className="flex gap-2">
              <Button 
                onClick={() => navigate("/schedules/new")}
                className="inline-flex items-center bg-blue-500 hover:bg-blue-600 text-white"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Schedule
              </Button>
              
              <Button 
                onClick={() => navigate("/schedules/simple/new")}
                variant="outline"
                className="inline-flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Simple Create (Future Dates)
              </Button>
            </div>
          </div>
        </div>
        
        {/* Search bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search schedules by title or location"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {/* Error message if applicable */}
        {ErrorMessage}
        
        {/* Schedule tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="upcoming">
              Upcoming Schedules
            </TabsTrigger>
            <TabsTrigger value="past">
              Past Schedules
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Cancelled Schedules
            </TabsTrigger>
          </TabsList>
          
          {/* Tab content */}
          <TabsContent value={activeTab}>
            {isLoading ? (
              <div className="space-y-1 border rounded overflow-hidden">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white border-b overflow-hidden">
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-6 w-6 rounded-full" />
                          <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredSchedules.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                {filteredSchedules.map((schedule) => (
                  <TripCard key={schedule.id} trip={schedule} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">
                  {activeTab === "upcoming" && "No upcoming schedules"}
                  {activeTab === "past" && "No past schedules"}
                  {activeTab === "cancelled" && "No cancelled schedules"}
                </h3>
                <p className="text-neutral-500 mb-4">
                  {activeTab === "upcoming" && "Start planning your next adventure!"}
                  {activeTab === "past" && "Your completed schedules will appear here."}
                  {activeTab === "cancelled" && "Cancelled schedules will appear here."}
                </p>
                {activeTab === "upcoming" && (
                  <Button 
                    onClick={() => navigate("/schedules/new")}
                    className="inline-flex items-center bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Create New Schedule
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}