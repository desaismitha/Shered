import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trip as BaseTrip, ItineraryItem, Expense, User, GroupMember } from "@shared/schema";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, addDays } from "date-fns";
import { isSpecialDateMarker, formatDateRange } from "@/lib/utils";
import { 
  Calendar, CalendarRange, MapPin, Users, PlusIcon, PencilIcon, 
  DollarSign, ClipboardList, Info, ArrowLeft, Car, UserCheck, ArrowRight,
  Map, Navigation, PlayCircle, StopCircle, Share2, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
// Import Leaflet map components
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ItineraryItem as ItineraryItemComponent } from "@/components/itinerary/itinerary-item";
import { ItineraryForm } from "@/components/itinerary/itinerary-form";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { TripVehicleList } from "@/components/vehicles/trip-vehicle-list";
import { DriverInfoSection } from "@/components/user/driver-info-section";
import { TripDriverAssignment } from "@/components/user/trip-driver-assignment";
import { useToast } from "@/hooks/use-toast";

// Extended Trip type with access level from the backend
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member';
}

// Simple edit form component to edit trip directly on the details page
function TripQuickEdit({ trip, onSuccess }: { trip: Trip, onSuccess: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Simple state values for all fields
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination);
  const [startLocation, setStartLocation] = useState(trip.startLocation || '');
  const [status, setStatus] = useState(trip.status || 'planning');
  
  // Simplified date handling - directly use string values in ISO format
  // Also handle our special marker date (2099-12-31)
  const formatDefaultDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '';
    
    // Check for our special marker date
    if (isSpecialDateMarker(String(dateStr))) {
      return '';
    }
    
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? '' : format(date, 'yyyy-MM-dd');
    } catch (e) {
      console.error("Date parsing error:", e);
      return '';
    }
  };
  
  const [startDate, setStartDate] = useState(formatDefaultDate(trip.startDate));
  const [endDate, setEndDate] = useState(formatDefaultDate(trip.endDate));
  
  console.log("Initial form values:", {
    name,
    destination,
    startDate,
    endDate,
    status,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate
  });
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    try {
      console.log("Form submitted with values:", {
        name,
        destination,
        startDate,
        endDate,
        status
      });
      
      // Create full payload with special date marker for cleared dates
      const payload = {
        name,
        destination,
        startLocation,
        status,
        startDate: startDate ? `${startDate}T12:00:00Z` : "2099-12-31T00:00:00Z", // Use marker date for empty dates
        endDate: endDate ? `${endDate}T12:00:00Z` : "2099-12-31T00:00:00Z" // Use marker date for empty dates
      };
      
      // Extra debugging for date values
      console.log("Date strings before submit:", {
        startDate,
        endDate,
        formattedStart: payload.startDate,
        formattedEnd: payload.endDate
      });
      
      console.log("Sending trip update with payload:", payload);
      
      // Use the fetch API directly (no React Query)
      const response = await fetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      
      // Better response handling
      let responseData;
      try {
        // Try to parse as JSON first
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      } catch (err) {
        responseData = await response.text();
      }
      
      console.log("Server response:", {
        status: response.status,
        data: responseData
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${
          typeof responseData === 'string' 
            ? responseData.substring(0, 100) 
            : JSON.stringify(responseData)
        }`);
      }
      
      // Success
      toast({
        title: "Trip updated",
        description: "Trip details have been updated successfully!"
      });
      
      // Let parent know to refresh data
      onSuccess();
    } catch (error) {
      console.error("Failed to update trip:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div className="p-4 border rounded-md bg-white">
      <h3 className="text-lg font-semibold mb-4">Edit Trip Details</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Trip Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Destination
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full p-2 border rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Start Location
          </label>
          <input
            type="text"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="Enter departure location"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border rounded-md"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full p-2 border rounded-md"
          >
            <option value="planning">Planning</option>
            <option value="confirmed">Confirmed</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onSuccess()}
            className="px-4 py-2 border rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id);
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [isAddingItinerary, setIsAddingItinerary] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [editingItineraryItem, setEditingItineraryItem] = useState<ItineraryItem | null>(null);
  
  // Check URL for edit=true parameter - using window.location to get the full URL
  // This ensures we capture query parameters correctly even with Wouter routing
  const fullUrl = window.location.href;
  const urlObj = new URL(fullUrl);
  const shouldStartEditing = urlObj.searchParams.get('edit') === 'true';
  
  // Debug URL parameters
  console.log("URL params check:", {
    fullLocation: location,
    windowLocation: fullUrl,
    searchParams: Object.fromEntries(urlObj.searchParams.entries()),
    shouldStartEditing
  });
  
  // Get tab from URL query parameter
  const tabParam = urlObj.searchParams.get('tab');
  const defaultTab = tabParam && ['info', 'itinerary', 'expenses', 'vehicles', 'drivers', 'tracking'].includes(tabParam) 
    ? tabParam 
    : 'info';
    
  const [isEditingTrip, setIsEditingTrip] = useState(shouldStartEditing);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Get trip details directly from the specific endpoint to get access level info
  const { data: trip, isLoading: isLoadingTrip, refetch: refetchTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });
  
  // Use an effect to check if we need to be in edit mode
  useEffect(() => {
    // When the component mounts or shouldStartEditing changes
    if (trip && trip._accessLevel === 'owner') {
      // Re-check URL params directly from window.location
      // This ensures the latest query params are used even if they change
      const currentUrl = new URL(window.location.href);
      const editMode = currentUrl.searchParams.get('edit') === 'true';
      
      console.log("Trip access level:", trip._accessLevel);
      console.log("Edit mode check:", {
        editQueryParam: currentUrl.searchParams.get('edit'),
        shouldActivateEdit: editMode
      });
      
      if (editMode) {
        console.log("Activating edit mode from URL parameter!");
        setIsEditingTrip(true);
      }
    }
  }, [trip]);

  // Get itinerary items
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/trips", tripId, "itinerary"],
    enabled: !!tripId,
  });

  // Get expenses
  const { data: expensesData, isLoading: isLoadingExpenses } = useQuery<any[]>({
    queryKey: ["/api/trips", tripId, "expenses"],
    enabled: !!tripId,
  });
  
  // Filter out any non-expense items from the expenses array
  const expenses = expensesData?.filter(item => 
    item && typeof item === 'object' && 'amount' in item
  ) as Expense[] || [];

  // Get group members
  // In the API, group members doesn't return what it's supposed to,
  // so we're adding the creator to simulate group members until this is fixed
  const { data: groupMembers, isLoading: isLoadingGroupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", trip?.groupId, "members"],
    enabled: !!trip?.groupId && !!trip,
    initialData: trip?.groupId ? [
      {
        id: 1,
        groupId: trip.groupId,
        userId: trip.createdBy,
        role: "admin",
        joinedAt: new Date()
      }
    ] : undefined,
  });

  // Get all users for names and avatars
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!groupMembers,
  });

  // Trip tracking state and refs
  const mapRef = useRef<L.Map | null>(null);
  const [isLocationUpdating, setIsLocationUpdating] = useState(false);
  const [locationUpdateError, setLocationUpdateError] = useState<string | null>(null);
  
  // States for itinerary selection and tracking
  const [showItinerarySelector, setShowItinerarySelector] = useState(false);
  const [selectedItineraryIds, setSelectedItineraryIds] = useState<number[]>([]);
  const [selectedItineraryItems, setSelectedItineraryItems] = useState<ItineraryItem[]>([]);
  const [currentItineraryStep, setCurrentItineraryStep] = useState(0);

  // Trip tracking mutations
  const startTripMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/start`, {
        itineraryIds: selectedItineraryIds.length > 0 ? selectedItineraryIds : undefined
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trip started",
        description: "Trip tracking has been started successfully!"
      });
      
      // Store the selected itinerary items for step-by-step tracking
      if (data.selectedItineraryItems && data.selectedItineraryItems.length > 0) {
        // Sort items by day
        const items = [...data.selectedItineraryItems];
        items.sort((a, b) => a.day - b.day);
        setSelectedItineraryItems(items);
        setCurrentItineraryStep(0);
      }
      
      // Close the dialog
      setShowItinerarySelector(false);
      
      // Keep the IDs in state for reference
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
    },
    onError: (error) => {
      toast({
        title: "Error starting trip",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const updateLocationMutation = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/update-location`, coords);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
    },
    onError: (error) => {
      setLocationUpdateError(error.message);
      toast({
        title: "Location update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const completeTripMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/complete`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trip completed",
        description: "Trip has been marked as completed!"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
    },
    onError: (error) => {
      toast({
        title: "Error completing trip",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Function to start trip tracking
  const handleStartTracking = () => {
    // If there are itinerary items, show the selector dialog
    if (itineraryItems && itineraryItems.length > 0) {
      setShowItinerarySelector(true);
    } else {
      // If no itinerary items, just start tracking
      startTripMutation.mutate();
    }
  };
  
  // Function to complete trip
  const handleCompleteTrip = () => {
    completeTripMutation.mutate();
  };
  
  // Function to update current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationUpdateError("Geolocation is not supported by your browser");
      return;
    }
    
    setIsLocationUpdating(true);
    setLocationUpdateError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update the map center if map is available
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 13);
        }
        
        // Send the location update to the server
        updateLocationMutation.mutate({ latitude, longitude });
        setIsLocationUpdating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        setLocationUpdateError(`Error getting location: ${error.message}`);
        setIsLocationUpdating(false);
        
        toast({
          title: "Location error",
          description: error.message,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };
  
  // Handler for successful trip edit
  const handleTripEditSuccess = () => {
    setIsEditingTrip(false);
    refetchTrip();
  };
  
  // Debug output
  useEffect(() => {
    console.log("Users data:", users);
    console.log("Group members:", groupMembers);
    console.log("Trip data:", trip);
    console.log("Trip creator:", trip?.createdBy, users?.find(u => u.id === trip?.createdBy));
  }, [users, groupMembers, trip]);

  // Debug
  useEffect(() => {
    console.log("Itinerary items:", itineraryItems);
    console.log("Raw trip data:", trip);
    console.log("Trip start date:", trip?.startDate);
    console.log("Trip end date:", trip?.endDate);
  }, [itineraryItems, trip]);
  
  // Debug expenses
  useEffect(() => {
    console.log("Expenses data:", expenses);
  }, [expenses]);
  
  // Debug itinerary tracking
  useEffect(() => {
    console.log("Selected itinerary items:", selectedItineraryItems);
    console.log("Current itinerary step:", currentItineraryStep);
  }, [selectedItineraryItems, currentItineraryStep]);
  
  // Listen for URL changes to update tab
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const tabFromUrl = currentUrl.searchParams.get('tab');
    
    if (tabFromUrl && ['info', 'itinerary', 'expenses', 'vehicles', 'drivers', 'tracking'].includes(tabFromUrl)) {
      console.log("Setting active tab from URL parameter:", tabFromUrl);
      setActiveTab(tabFromUrl);
    }
  }, [location]); // Update when location changes

  // Filter transportation activities (with fromLocation and toLocation)
  const transportActivities = itineraryItems?.filter(item => 
    item.fromLocation && item.toLocation
  ) || [];
  
  // Group transportation activities by day for easy access
  const transportByDay = transportActivities.reduce((acc, item) => {
    if (item.day === null || item.day === undefined) {
      return acc;
    }
    
    const day = item.day;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>);
  
  // Group regular itinerary items by day (excluding transportation items if configured to separate them)
  const itemsByDay = itineraryItems?.reduce((acc, item) => {
    // Skip items that don't have a valid day value
    if (item.day === null || item.day === undefined) {
      return acc;
    }
    
    // Option 1: Include all items in the regular itinerary
    // Option 2: Exclude transportation items from regular itinerary (uncomment the next line)
    // if (item.fromLocation && item.toLocation) return acc;
    
    const day = item.day;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>) || {};

  // Use the utility function from lib/utils.ts instead of redefining here
  // This ensures consistent formatting across the app

  // Get trip status badge color
  const getStatusColor = (status: string | null | undefined) => {
    if (!status) {
      return 'bg-neutral-100 text-neutral-800';
    }
    
    switch (status.toLowerCase()) {
      case 'planning':
        return 'bg-orange-100 text-orange-800';
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-800';
      case 'upcoming':
        return 'bg-primary-100 text-primary-800';
      case 'completed':
        return 'bg-neutral-100 text-neutral-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  // Calculate total expenses
  const totalExpenses = expenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;
  
  if (isLoadingTrip) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Skeleton className="h-8 w-60 mb-4" />
          <Skeleton className="h-6 w-full max-w-md mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Skeleton className="h-[300px] w-full mb-6" />
            </div>
            <div>
              <Skeleton className="h-[200px] w-full mb-6" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12">
            <Info className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-neutral-800 mb-1">Trip not found</h2>
            <p className="text-neutral-500 mb-6">The trip you're looking for doesn't exist or you don't have access.</p>
            <Button onClick={() => navigate("/trips")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Trips
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Handle itinerary selection toggle
  const toggleItinerarySelection = (itemId: number) => {
    setSelectedItineraryIds(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  // Function to start trip with selected itinerary items
  const startTripWithSelectedItems = () => {
    startTripMutation.mutate();
  };

  return (
    <AppShell>
      {/* Itinerary selection dialog */}
      {showItinerarySelector && (
        <Dialog open={showItinerarySelector} onOpenChange={setShowItinerarySelector}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Itinerary Items</DialogTitle>
              <DialogDescription>
                Choose which itinerary items you want to include in this trip tracking session.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              {itineraryItems && itineraryItems.length > 0 ? (
                <div className="space-y-4 py-2">
                  {itineraryItems.map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 border-b pb-3">
                      <Checkbox 
                        id={`itinerary-${item.id}`}
                        checked={selectedItineraryIds.includes(item.id)}
                        onCheckedChange={() => toggleItinerarySelection(item.id)}
                      />
                      <div>
                        <label 
                          htmlFor={`itinerary-${item.id}`}
                          className="font-medium cursor-pointer"
                        >
                          {item.title}
                        </label>
                        <div className="text-sm text-muted-foreground">
                          {item.fromLocation && item.toLocation && (
                            <div className="mt-1">
                              <span className="text-neutral-500">Travel: </span>
                              {item.fromLocation} to {item.toLocation}
                            </div>
                          )}
                          <div className="mt-1">
                            <span className="text-neutral-500">Day: </span>
                            {item.day}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  No itinerary items found for this trip.
                </div>
              )}
            </div>
            <DialogFooter className="flex sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowItinerarySelector(false)}
              >
                Cancel
              </Button>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Select all items
                    if (itineraryItems) {
                      setSelectedItineraryIds(itineraryItems.map(item => item.id));
                    }
                  }}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  onClick={startTripWithSelectedItems}
                  disabled={startTripMutation.isPending}
                >
                  {startTripMutation.isPending ? 'Starting...' : 'Start Trip'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Trip header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="mb-2 sm:mb-0 -ml-2 w-fit"
              onClick={() => navigate("/trips")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to trips
            </Button>
            
            <Badge className={getStatusColor(trip.status)}>
              {trip.status ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1) : 'Unknown'}
            </Badge>
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-2">
            {trip.destination}
          </h1>
          
          <p className="text-xl text-neutral-600 mb-4">
            {trip.name}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 text-sm text-neutral-600">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-neutral-500" />
              {formatDateRange(trip.startDate, trip.endDate)}
            </div>
            <div className="flex items-center">
              <MapPin className="h-4 w-4 mr-2 text-neutral-500" />
              {trip.destination}
            </div>
            <div className="flex items-center">
              <Users className="h-4 w-4 mr-2 text-neutral-500" />
              {Math.max(groupMembers?.length || 0, 1)} traveler{Math.max(groupMembers?.length || 0, 1) !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        
        {/* Trip content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Itinerary and expenses */}
          <div className="lg:col-span-2">
            <Tabs defaultValue={activeTab} onValueChange={(value) => setActiveTab(value)}>
              <TabsList>
                <TabsTrigger value="info">Trip Info</TabsTrigger>
                <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
                <TabsTrigger value="drivers">Drivers</TabsTrigger>
                <TabsTrigger value="tracking">Tracking</TabsTrigger>
              </TabsList>
              
              {/* Trip Info tab */}
              <TabsContent value="info">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Trip Information</CardTitle>
                    {trip._accessLevel === 'owner' && !isEditingTrip && (
                      <div className="flex space-x-2">
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingTrip(true)}
                        >
                          <PencilIcon className="h-4 w-4 mr-2" />
                          Edit Trip
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isEditingTrip ? (
                      <TripQuickEdit trip={trip} onSuccess={handleTripEditSuccess} />
                    ) : (
                      <>
                        {trip.description ? (
                          <div className="mb-6">
                            <h3 className="font-medium text-neutral-800 mb-2">Description</h3>
                            <p className="text-neutral-600">{trip.description}</p>
                          </div>
                        ) : null}
                        
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-medium text-neutral-800 mb-2">Trip Details</h3>
                            <div className="border rounded-md overflow-hidden">
                              <div className="grid grid-cols-1 md:grid-cols-2">
                                <div className="p-4 border-b md:border-r">
                                  <p className="text-sm text-neutral-500 mb-1">Trip Name</p>
                                  <p className="font-medium">{trip.name}</p>
                                </div>
                                <div className="p-4 border-b">
                                  <p className="text-sm text-neutral-500 mb-1">Destination</p>
                                  <p className="font-medium">{trip.destination}</p>
                                </div>
                                <div className="p-4 border-b md:border-r">
                                  <p className="text-sm text-neutral-500 mb-1">Start Location</p>
                                  <p className="font-medium">
                                    {trip.startLocation || 'Not specified'}
                                  </p>
                                </div>
                                <div className="p-4 border-b">
                                  <p className="text-sm text-neutral-500 mb-1">Travel Distance</p>
                                  <p className="font-medium">
                                    {trip.startLocation ? `${trip.startLocation} to ${trip.destination}` : 'Not available'}
                                  </p>
                                </div>
                                <div className="p-4 border-b md:border-b-0 md:border-r">
                                  <p className="text-sm text-neutral-500 mb-1">Start Date</p>
                                  <p className="font-medium">
                                    {trip.startDate && !isSpecialDateMarker(String(trip.startDate)) 
                                      ? format(new Date(trip.startDate), 'MMMM d, yyyy') 
                                      : 'Not specified'}
                                  </p>
                                </div>
                                <div className="p-4">
                                  <p className="text-sm text-neutral-500 mb-1">End Date</p>
                                  <p className="font-medium">
                                    {trip.endDate && !isSpecialDateMarker(String(trip.endDate))
                                      ? format(new Date(trip.endDate), 'MMMM d, yyyy') 
                                      : 'Not specified'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Transportation Schedule Section */}
                          {transportActivities.length > 0 && (
                            <div>
                              <h3 className="font-medium text-neutral-800 mb-2 flex items-center">
                                <Car className="h-4 w-4 mr-2 text-blue-500" />
                                Transportation Schedule
                              </h3>
                              <div className="border border-blue-100 rounded-md bg-blue-50 p-4">
                                <div className="space-y-4">
                                  {Object.entries(transportByDay)
                                    .sort(([dayA], [dayB]) => parseInt(dayA) - parseInt(dayB))
                                    .map(([day, items]) => (
                                      <div key={`transport-day-${day}`}>
                                        <h4 className="text-sm font-medium text-neutral-700 mb-2">
                                          Day {day} {trip.startDate && !isSpecialDateMarker(String(trip.startDate)) && (
                                            <span className="text-neutral-500 font-normal">
                                              ({format(
                                                addDays(
                                                  new Date(trip.startDate), 
                                                  parseInt(day) - 1
                                                ), 
                                                'EEE, MMM d'
                                              )})
                                            </span>
                                          )}
                                        </h4>
                                        <div className="space-y-2">
                                          {items
                                            .sort((a, b) => 
                                              a.startTime && b.startTime 
                                                ? a.startTime.localeCompare(b.startTime) 
                                                : 0
                                            )
                                            .map(item => {
                                              // Format the time for display
                                              const formatTime = (timeString?: string) => {
                                                if (!timeString) return null;
                                                
                                                try {
                                                  const [hours, minutes] = timeString.split(':');
                                                  const hourInt = parseInt(hours);
                                                  const isPM = hourInt >= 12;
                                                  const hour12 = hourInt % 12 || 12;
                                                  return `${hour12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
                                                } catch (error) {
                                                  return timeString;
                                                }
                                              };
                                              const timeDisplay = formatTime(item.startTime);
                                              
                                              // Check if this is a recurring item
                                              const getRecurrenceText = () => {
                                                if (!item.isRecurring) return null;
                                                
                                                switch (item.recurrencePattern) {
                                                  case 'daily':
                                                    return '(Daily)';
                                                  case 'weekdays':
                                                    return '(Mon-Fri)';
                                                  case 'weekends':
                                                    return '(Sat-Sun)';
                                                  case 'specific-days':
                                                    try {
                                                      let days = item.recurrenceDays;
                                                      if (typeof days === 'string') {
                                                        days = JSON.parse(days);
                                                      }
                                                      
                                                      if (Array.isArray(days) && days.length > 0) {
                                                        // Map day codes to short day names
                                                        const dayMap: Record<string, string> = {
                                                          mon: 'Mon',
                                                          tue: 'Tue',
                                                          wed: 'Wed',
                                                          thu: 'Thu',
                                                          fri: 'Fri',
                                                          sat: 'Sat',
                                                          sun: 'Sun'
                                                        };
                                                        
                                                        const dayNames = days.map(d => dayMap[d] || d).join(', ');
                                                        return `(${dayNames})`;
                                                      }
                                                      return '(Custom)';
                                                    } catch (error) {
                                                      return '(Custom)';
                                                    }
                                                  default:
                                                    return '(Custom)';
                                                }
                                              };
                                              
                                              return (
                                                <div 
                                                  key={item.id} 
                                                  className="flex items-center bg-white rounded-md p-3 border border-blue-200"
                                                >
                                                  <div className="mr-4 text-center">
                                                    <div className="text-sm font-semibold text-blue-600">{timeDisplay}</div>
                                                    {item.isRecurring && (
                                                      <div className="text-xs text-blue-500">
                                                        {getRecurrenceText()}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="flex-1 flex items-center">
                                                    <div className="flex-1">
                                                      <div className="text-sm font-medium text-neutral-800">{item.title}</div>
                                                      <div className="flex items-center text-xs text-neutral-600 mt-1">
                                                        <MapPin className="h-3 w-3 text-blue-400 mr-1" />
                                                        <span>{item.fromLocation}</span>
                                                        <ArrowRight className="h-3 w-3 mx-1 text-blue-400" />
                                                        <MapPin className="h-3 w-3 text-blue-400 mr-1" />
                                                        <span>{item.toLocation}</span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })
                                          }
                                        </div>
                                      </div>
                                    ))
                                  }
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Itinerary tab */}
              <TabsContent value="itinerary">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Trip Itinerary</CardTitle>
                    {!isAddingItinerary && !editingItineraryItem && trip._accessLevel && (
                      <Button 
                        size="sm"
                        onClick={() => setIsAddingItinerary(true)}
                      >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isAddingItinerary || editingItineraryItem ? (
                      <>
                        <ItineraryForm 
                          tripId={tripId} 
                          initialData={editingItineraryItem ? {
                            id: editingItineraryItem.id,
                            day: editingItineraryItem.day,
                            title: editingItineraryItem.title,
                            description: editingItineraryItem.description,
                            location: editingItineraryItem.location,
                            startTime: editingItineraryItem.startTime,
                            endTime: editingItineraryItem.endTime,
                            isRecurring: editingItineraryItem.isRecurring === null ? false : editingItineraryItem.isRecurring,
                            recurrencePattern: editingItineraryItem.recurrencePattern,
                            recurrenceDays: editingItineraryItem.recurrenceDays,
                            fromLocation: editingItineraryItem.fromLocation,
                            toLocation: editingItineraryItem.toLocation
                          } : undefined}
                          onSuccess={() => {
                            setIsAddingItinerary(false);
                            setEditingItineraryItem(null);
                          }}
                          onCancel={() => {
                            setIsAddingItinerary(false);
                            setEditingItineraryItem(null);
                          }}
                        />
                        <Separator className="my-6" />
                      </>
                    ) : null}
                    
                    {isLoadingItinerary ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="p-4 border rounded-lg">
                            <Skeleton className="h-5 w-32 mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-2/3" />
                          </div>
                        ))}
                      </div>
                    ) : Object.keys(itemsByDay).length > 0 ? (
                      <div className="space-y-8">
                        {Object.entries(itemsByDay)
                          .sort(([dayA], [dayB]) => parseInt(dayA) - parseInt(dayB))
                          .map(([day, items]) => (
                            <div key={day}>
                              <h3 className="font-medium text-neutral-800 mb-3">
                                Day {day}
                              </h3>
                              <div className="space-y-3">
                                {items
                                  .sort((a, b) => 
                                    a.startTime && b.startTime 
                                      ? a.startTime.localeCompare(b.startTime) 
                                      : 0
                                  )
                                  .map(item => (
                                    <ItineraryItemComponent 
                                      key={item.id} 
                                      item={item} 
                                      users={users || []}
                                      tripAccessLevel={trip._accessLevel}
                                      onEdit={(item) => setEditingItineraryItem(item)}
                                    />
                                  ))
                                }
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <ClipboardList className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-neutral-700 mb-1">No itinerary items yet</h3>
                        <p className="text-neutral-500 mb-6">Start planning your trip by adding activities</p>
                        {trip._accessLevel && (
                          <Button onClick={() => setIsAddingItinerary(true)}>
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add First Item
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Expenses tab */}
              <TabsContent value="expenses">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Trip Expenses</CardTitle>
                      {expenses && expenses.length > 0 && (
                        <p className="text-sm text-neutral-500 mt-1">
                          Total: ${(totalExpenses / 100).toFixed(2)}
                        </p>
                      )}
                    </div>
                    {!isAddingExpense && trip._accessLevel && (
                      <Button 
                        size="sm"
                        onClick={() => setIsAddingExpense(true)}
                      >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Expense
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isAddingExpense ? (
                      <>
                        <ExpenseForm 
                          tripId={tripId} 
                          groupMembers={groupMembers || []}
                          users={users || []}
                          onSuccess={() => setIsAddingExpense(false)}
                          onCancel={() => setIsAddingExpense(false)}
                        />
                        <Separator className="my-6" />
                      </>
                    ) : null}
                    
                    {isLoadingExpenses ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="p-4 border rounded-lg">
                            <Skeleton className="h-5 w-32 mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-1/3" />
                          </div>
                        ))}
                      </div>
                    ) : expenses && expenses.length > 0 ? (
                      <div className="space-y-4">
                        {expenses
                          .sort((a, b) => {
                            // Sort by date descending (most recent first)
                            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                            return dateB.getTime() - dateA.getTime();
                          })
                          .map(expense => (
                            <ExpenseCard 
                              key={expense.id} 
                              expense={expense} 
                              users={users || []}
                            />
                          ))
                        }
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <DollarSign className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-neutral-700 mb-1">No expenses yet</h3>
                        <p className="text-neutral-500 mb-6">Start tracking trip expenses</p>
                        {trip._accessLevel && (
                          <Button onClick={() => setIsAddingExpense(true)}>
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add First Expense
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Vehicles tab */}
              <TabsContent value="vehicles">
                <Card>
                  <CardHeader>
                    <CardTitle>Trip Vehicles</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {trip && trip._accessLevel && (
                      <TripVehicleList tripId={tripId} accessLevel={trip._accessLevel} />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Drivers tab */}
              <TabsContent value="drivers">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Driver Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {trip && trip._accessLevel && user && (
                        <DriverInfoSection 
                          user={user} 
                          tripId={tripId} 
                          accessLevel={trip._accessLevel} 
                        />
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Driver Assignments</CardTitle>
                      <CardDescription>
                        Manage which drivers are assigned to vehicles for this trip
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {trip && trip._accessLevel && (
                        <TripDriverAssignment 
                          tripId={tripId} 
                          accessLevel={trip._accessLevel} 
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              {/* Trip Tracking tab */}
              <TabsContent value="tracking">
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Trip Tracking</CardTitle>
                        <CardDescription>
                          {trip.status === 'in-progress' 
                            ? 'This trip is currently active. Track your journey on the map.'
                            : 'Start tracking to monitor your journey on the map.'}
                        </CardDescription>
                      </div>
                      
                      {trip._accessLevel === 'owner' && (
                        <div className="flex space-x-2">
                          {trip.status !== 'in-progress' && trip.status !== 'completed' && (
                            <Button 
                              onClick={handleStartTracking}
                              disabled={startTripMutation.isPending}
                              variant="outline"
                            >
                              <PlayCircle className="h-4 w-4 mr-2" />
                              {startTripMutation.isPending ? 'Starting...' : 'Start Trip'}
                            </Button>
                          )}
                          
                          {trip.status === 'in-progress' && (
                            <>
                              <Button 
                                onClick={getCurrentLocation}
                                disabled={isLocationUpdating}
                                variant="outline"
                              >
                                <Navigation className="h-4 w-4 mr-2" />
                                {isLocationUpdating ? 'Updating...' : 'Update Location'}
                              </Button>
                              
                              <Button 
                                onClick={handleCompleteTrip}
                                disabled={completeTripMutation.isPending}
                                variant="outline"
                              >
                                <StopCircle className="h-4 w-4 mr-2" />
                                {completeTripMutation.isPending ? 'Completing...' : 'Complete Trip'}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      {/* Trip status information */}
                      <div className="mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-background border rounded-lg p-4">
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                            <p className="text-lg font-medium">
                              <Badge className={getStatusColor(trip.status)}>
                                {trip.status ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1) : 'Unknown'}
                              </Badge>
                            </p>
                          </div>
                          
                          <div className="bg-background border rounded-lg p-4">
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Distance Traveled</h3>
                            <p className="text-lg font-medium">
                              {trip.distanceTraveled ? `${trip.distanceTraveled.toFixed(2)} km` : 'Not started'}
                            </p>
                          </div>
                          
                          <div className="bg-background border rounded-lg p-4">
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h3>
                            <p className="text-lg font-medium">
                              {trip.lastLocationUpdate 
                                ? format(new Date(trip.lastLocationUpdate), 'MMM d, yyyy HH:mm:ss')
                                : 'Not started'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Error alert if location update fails */}
                      {locationUpdateError && (
                        <Alert variant="destructive" className="mb-6">
                          <AlertTitle>Error updating location</AlertTitle>
                          <AlertDescription>{locationUpdateError}</AlertDescription>
                        </Alert>
                      )}

                      {/* Map component */}
                      <div className="h-[400px] border rounded-lg overflow-hidden">
                        {/* Leaflet map container */}
                        {typeof window !== 'undefined' ? (
                          <MapContainer
                            center={
                              trip.currentLatitude && trip.currentLongitude
                                ? [trip.currentLatitude, trip.currentLongitude] 
                                : [40.7128, -74.0060] // Default to NYC
                            }
                            zoom={13}
                            style={{ height: '100%', width: '100%' }}
                            ref={(map) => {
                              if (map) {
                                mapRef.current = map;
                              }
                            }}
                          >
                            <TileLayer
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            
                            {/* Show marker for current location */}
                            {trip.currentLatitude && trip.currentLongitude && (
                              <Marker 
                                position={[trip.currentLatitude, trip.currentLongitude]}
                              >
                                <Popup>
                                  <div>
                                    <strong>{trip.name}</strong><br />
                                    <span>Current location</span><br />
                                    <span>Last updated: {trip.lastLocationUpdate 
                                      ? format(new Date(trip.lastLocationUpdate), 'MMM d, yyyy HH:mm:ss')
                                      : 'Unknown'}</span>
                                  </div>
                                </Popup>
                              </Marker>
                            )}
                          </MapContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <p>Map loading...</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Current Itinerary Step */}
                      {trip.status === 'in-progress' && selectedItineraryItems.length > 0 && (
                        <div className="mt-6 border-t pt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-neutral-800">Current Itinerary</h3>
                            <div className="text-sm text-neutral-500">
                              Step {currentItineraryStep + 1} of {selectedItineraryItems.length}
                            </div>
                          </div>
                          
                          {selectedItineraryItems[currentItineraryStep] && (
                            <div className="border rounded-md p-4 bg-primary-50">
                              <div className="flex items-start gap-4">
                                <div className="bg-primary-100 rounded-full p-2 text-primary-800">
                                  {selectedItineraryItems[currentItineraryStep].fromLocation && 
                                   selectedItineraryItems[currentItineraryStep].toLocation ? (
                                    <Car className="h-6 w-6" />
                                  ) : (
                                    <MapPin className="h-6 w-6" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-semibold text-lg mb-1">
                                    {selectedItineraryItems[currentItineraryStep].title}
                                  </h4>
                                  
                                  {selectedItineraryItems[currentItineraryStep].description && (
                                    <p className="text-neutral-700 mb-2">{selectedItineraryItems[currentItineraryStep].description}</p>
                                  )}
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <span className="text-neutral-500">Day: </span>
                                      <span className="font-medium">{selectedItineraryItems[currentItineraryStep].day}</span>
                                    </div>
                                    
                                    {selectedItineraryItems[currentItineraryStep].location && (
                                      <div>
                                        <span className="text-neutral-500">Location: </span>
                                        <span className="font-medium">{selectedItineraryItems[currentItineraryStep].location}</span>
                                      </div>
                                    )}
                                    
                                    {selectedItineraryItems[currentItineraryStep].fromLocation && selectedItineraryItems[currentItineraryStep].toLocation && (
                                      <div className="sm:col-span-2">
                                        <span className="text-neutral-500">Travel: </span>
                                        <span className="font-medium">{selectedItineraryItems[currentItineraryStep].fromLocation} to {selectedItineraryItems[currentItineraryStep].toLocation}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex justify-between mt-4 pt-3 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentItineraryStep(prev => Math.max(0, prev - 1))}
                                  disabled={currentItineraryStep === 0}
                                >
                                  <ArrowLeft className="h-4 w-4 mr-1" /> Previous
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-primary-50 hover:bg-primary-100 border-primary-200"
                                  onClick={() => getCurrentLocation()}
                                  disabled={isLocationUpdating}
                                >
                                  <Navigation className="h-4 w-4 mr-1" />
                                  {isLocationUpdating ? 'Updating...' : 'Update Location'}
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (currentItineraryStep < selectedItineraryItems.length - 1) {
                                      setCurrentItineraryStep(prev => prev + 1);
                                    }
                                  }}
                                  disabled={currentItineraryStep === selectedItineraryItems.length - 1}
                                >
                                  Next <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Instructions for trip owners */}
                      {trip._accessLevel === 'owner' && (
                        <div className="mt-6">
                          <h3 className="font-medium text-neutral-800 mb-2">Trip Tracking Instructions</h3>
                          <ul className="list-disc pl-6 space-y-2 text-sm text-neutral-600">
                            {trip.status !== 'in-progress' && trip.status !== 'completed' && (
                              <li>Click "Start Trip" to begin tracking your journey.</li>
                            )}
                            {trip.status === 'in-progress' && (
                              <>
                                <li>Click "Update Location" to update your current position on the map.</li>
                                <li>Your location will be saved and the distance traveled will be calculated.</li>
                                <li>Click "Complete Trip" when you have reached your destination.</li>
                                {selectedItineraryItems.length > 0 && (
                                  <li>Use the navigation buttons to move between itinerary steps.</li>
                                )}
                              </>
                            )}
                            {trip.status === 'completed' && (
                              <li>This trip has been completed. The final distance traveled is displayed above.</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Right column - Trip members */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Trip Members</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingGroupMembers || isLoadingUsers ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : groupMembers && groupMembers.length > 0 ? (
                  <div className="space-y-3">
                    {groupMembers.map(member => {
                      const memberUser = users?.find(u => u.id === member.userId);
                      return (
                        <div key={member.id} className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                            {memberUser?.displayName?.charAt(0) || memberUser?.username?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-medium">
                              {memberUser?.displayName || memberUser?.username || 'Unknown user'}
                            </p>
                            <p className="text-sm text-neutral-500">
                              {member.userId === trip.createdBy ? "Trip Organizer" : "Member"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-neutral-500">No members found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}