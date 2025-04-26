import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trip as BaseTrip, ItineraryItem, Expense, User, GroupMember } from "@shared/schema";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation, useNavigate } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, addDays } from "date-fns";
import { isSpecialDateMarker, formatDateRange, cn } from "@/lib/utils";
import { 
  AlertTriangle, Calendar as CalendarIcon, CalendarRange, MapPin, Users, PlusIcon, PencilIcon, 
  DollarSign, ClipboardList, Info, ArrowLeft, Car, UserCheck, ArrowRight,
  Map, Navigation, PlayCircle, StopCircle, Share2, Check, X
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
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
// Import Leaflet map components
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
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

// Extended Trip type with access level and location data
interface Trip {
  id: number;
  name: string;
  startLocation: string | null;
  destination: string;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  description: string | null;
  imageUrl: string | null;
  status: string;
  
  // Optional coordinates for start location
  startLocationLat?: number | null;
  startLocationLong?: number | null;
  
  // Optional coordinates for destination
  destinationLat?: number | null;
  destinationLong?: number | null;
  
  // Current location tracking properties
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastLocationUpdate: string | null; // ISO date string
  distanceTraveled: number;
  
  // Relations
  groupId: number | null;
  createdBy: number;
  createdAt: string; // ISO date string
  
  // Access level set by the API
  _accessLevel?: 'owner' | 'member';
}

// Simple edit form component to edit trip directly on the details page
function TripQuickEdit({ trip, onSuccess }: { trip: Trip, onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(trip.name);
  const [status, setStatus] = useState(trip.status || 'planning');
  const [startLocation, setStartLocation] = useState(trip.startLocation || '');
  const [destination, setDestination] = useState(trip.destination);
  const [description, setDescription] = useState(trip.description || '');
  const [startDate, setStartDate] = useState(trip.startDate ? new Date(trip.startDate) : new Date());
  const [endDate, setEndDate] = useState(trip.endDate ? new Date(trip.endDate) : new Date());
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Status options for the select component
  const statusOptions = [
    { value: 'planning', label: 'Planning' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  // Update trip mutation
  const updateTripMutation = useMutation({
    mutationFn: async (values: any) => {
      console.log("Updating trip with values:", values);
      // Convert dates to ISO strings
      const formattedValues = {
        ...values,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString()
      };
      
      const res = await apiRequest("PATCH", `/api/trips/${trip.id}`, formattedValues);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Trip details have been updated.",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update trip: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Remove unused function

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = {
      name,
      status,
      startLocation,
      destination,
      description,
      startDate,
      endDate
    };
    updateTripMutation.mutate(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trip Name */}
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">Trip Name</label>
          <input
            id="name"
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        
        {/* Status */}
        <div className="space-y-2">
          <label htmlFor="status" className="text-sm font-medium">Status</label>
          <select
            id="status"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        {/* Start Location */}
        <div className="space-y-2">
          <label htmlFor="startLocation" className="text-sm font-medium">Starting Location</label>
          <input
            id="startLocation"
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
          />
        </div>
        
        {/* Destination */}
        <div className="space-y-2">
          <label htmlFor="destination" className="text-sm font-medium">Destination</label>
          <input
            id="destination"
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Date */}
        <div className="space-y-2">
          <label htmlFor="startDate" className="text-sm font-medium">Start Date</label>
          <input
            id="startDate"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={startDate ? format(startDate, "yyyy-MM-dd") : ""}
            onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : new Date())}
          />
        </div>
        
        {/* End Date */}
        <div className="space-y-2">
          <label htmlFor="endDate" className="text-sm font-medium">End Date</label>
          <input
            id="endDate"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={endDate ? format(endDate, "yyyy-MM-dd") : ""}
            onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : new Date())}
          />
        </div>
      </div>
      
      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <textarea
          id="description"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-24"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add some details about your trip..."
        />
      </div>
      
      {/* Buttons */}
      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          type="button"
          onClick={onSuccess}
        >
          Cancel
        </Button>
        <Button 
          type="submit"
          disabled={updateTripMutation.isPending}
        >
          {updateTripMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

// Component to display the trip map with Leaflet
function TripMap({
  tripId,
  height = "400px",
  width = "100%",
  startLocation,
  destination,
  currentLatitude,
  currentLongitude,
  mapRef,
}: {
  tripId: number;
  height?: string;
  width?: string;
  startLocation?: string | null;
  destination?: string | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  mapRef?: React.MutableRefObject<L.Map | null>;
}) {
  // Component implementation
  return <div>Trip map</div>;
}

function getStatusColor(status: string | undefined) {
  if (!status) return "bg-neutral-500";
  
  switch (status.toLowerCase()) {
    case 'planning':
      return "bg-blue-500 hover:bg-blue-600";
    case 'confirmed':
      return "bg-green-500 hover:bg-green-600";
    case 'in-progress':
      return "bg-amber-500 hover:bg-amber-600";
    case 'completed':
      return "bg-purple-500 hover:bg-purple-600";
    case 'cancelled':
      return "bg-red-500 hover:bg-red-600";
    default:
      return "bg-neutral-500 hover:bg-neutral-600";
  }
}

export default function TripDetailsPage() {
  // Get the trip ID from the URL
  const params = useParams();
  const tripId = parseInt(params.id);

  // Get URL query parameters
  const [, navigate] = useLocation();
  const [urlObj, setUrlObj] = useState<URL>(new URL(window.location.href));
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Update URL object when the location changes
  useEffect(() => {
    setUrlObj(new URL(window.location.href));
  }, [window.location.href]);
  
  // Check if we should start in edit mode
  const shouldStartEditing = urlObj.searchParams.get('edit') === 'true';
  
  // Get tab from URL query parameter
  const tabParam = urlObj.searchParams.get('tab');
  
  // State for editing items
  const [editingItineraryItem, setEditingItineraryItem] = useState<any>(null);
  const defaultTab = tabParam && ['info', 'itinerary', 'expenses', 'vehicles', 'drivers'].includes(tabParam) 
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
    console.log("Expenses:", expenses);
  }, [itineraryItems, expenses]);

  // Loading state
  if (isLoadingTrip) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div>
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Error state
  if (!trip) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              This trip does not exist or you don't have permission to view it.
            </AlertDescription>
          </Alert>
          
          <div className="mt-6">
            <Button onClick={() => navigate("/trips")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Trips
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center">
              {trip.name}
              {trip.status && (
                <Badge className={`ml-2 ${getStatusColor(trip.status)}`}>
                  {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                </Badge>
              )}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500 mt-1">
              <div className="flex items-center">
                <CalendarRange className="h-4 w-4 mr-1" />
                {formatDateRange(trip.startDate, trip.endDate)}
              </div>
              
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                {trip.destination || "No destination specified"}
              </div>
              
              {trip.groupId && (
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-1" />
                  {groupMembers?.length || 1} {groupMembers?.length === 1 ? "Member" : "Members"}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {trip._accessLevel === 'owner' && (
              <>
                {isEditingTrip ? (
                  <Button variant="outline" onClick={() => setIsEditingTrip(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel Editing
                  </Button>
                ) : (
                  <Button onClick={() => setIsEditingTrip(true)}>
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit Trip
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Editing form */}
        {isEditingTrip && trip._accessLevel === 'owner' && (
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Edit Trip Details</CardTitle>
              </CardHeader>
              <CardContent>
                <TripQuickEdit 
                  trip={trip} 
                  onSuccess={handleTripEditSuccess} 
                />
              </CardContent>
            </Card>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="info">Trip Info</TabsTrigger>
                <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
                <TabsTrigger value="drivers">Drivers</TabsTrigger>
              </TabsList>
              
              {/* Trip Info tab */}
              <TabsContent value="info">
                <Card>
                  <CardHeader>
                    <CardTitle>Trip Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {trip.description && (
                        <div>
                          <h3 className="font-medium text-neutral-800 mb-1">Description</h3>
                          <p className="text-neutral-600">{trip.description}</p>
                        </div>
                      )}
                      
                      <div>
                        <h3 className="font-medium text-neutral-800 mb-1">Trip Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-neutral-500 text-sm">Destination</p>
                            <p className="font-medium">{trip.destination || "Not specified"}</p>
                          </div>
                          
                          <div>
                            <p className="text-neutral-500 text-sm">Starting Location</p>
                            <p className="font-medium">{trip.startLocation || "Not specified"}</p>
                          </div>
                          
                          <div>
                            <p className="text-neutral-500 text-sm">Start Date</p>
                            <p className="font-medium">
                              {isSpecialDateMarker(trip.startDate) 
                                ? "Not specified" 
                                : format(new Date(trip.startDate), "MMMM d, yyyy")}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-neutral-500 text-sm">End Date</p>
                            <p className="font-medium">
                              {isSpecialDateMarker(trip.endDate) 
                                ? "Not specified" 
                                : format(new Date(trip.endDate), "MMMM d, yyyy")}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-neutral-500 text-sm">Status</p>
                            <p className="font-medium">
                              <Badge className={getStatusColor(trip.status)}>
                                {trip.status ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1) : "Planning"}
                              </Badge>
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-neutral-500 text-sm">Created</p>
                            <p className="font-medium">
                              {format(new Date(trip.createdAt), "MMMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {trip.groupId && (
                        <div>
                          <h3 className="font-medium text-neutral-800 mb-1">Group Information</h3>
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <p className="text-neutral-500 text-sm">Members</p>
                              <p className="font-medium">{groupMembers?.length || 1} {groupMembers?.length === 1 ? "Member" : "Members"}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Itinerary tab */}
              <TabsContent value="itinerary">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Itinerary</CardTitle>
                      <CardDescription>
                        {itineraryItems && itineraryItems.length > 0 
                          ? `${itineraryItems.length} ${itineraryItems.length === 1 ? "item" : "items"} planned` 
                          : "No itinerary items yet"}
                      </CardDescription>
                    </div>
                    
                    {trip._accessLevel === 'owner' && (
                      <ItineraryForm 
                        tripId={tripId} 
                        onSuccess={() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] });
                        }}
                      />
                    )}
                  </CardHeader>
                  <CardContent>
                    {isLoadingItinerary ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <Card key={i}>
                            <CardContent className="p-4">
                              <div className="flex items-start space-x-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-5 w-1/3" />
                                  <Skeleton className="h-4 w-2/3" />
                                  <div className="flex space-x-2">
                                    <Skeleton className="h-4 w-16" />
                                    <Skeleton className="h-4 w-16" />
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : itineraryItems && itineraryItems.length > 0 ? (
                      <div className="space-y-4">
                        {/* Itinerary Form */}
                        {/* Add Button */}
                        <div className="flex justify-end mb-4">
                          <Button
                            size="sm"
                            onClick={() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] });
                            }}
                          >
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add Itinerary Item
                          </Button>
                        </div>
                        
                        {/* Sort itinerary items by day */}
                        {[...itineraryItems]
                          .sort((a, b) => a.day - b.day)
                          .map(item => (
                            <ItineraryItemComponent 
                              key={item.id} 
                              item={item}
                              users={users || []}
                              tripAccessLevel={trip._accessLevel || 'member'}
                              trip={trip}
                              onEdit={() => queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] })}
                            />
                          ))
                        }
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <ClipboardList className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-neutral-900 mb-1">No itinerary items</h3>
                        <p className="text-neutral-500 mb-6 max-w-md mx-auto">
                          {trip._accessLevel === 'owner' 
                            ? "Add your first itinerary item to start planning your trip activities and schedule." 
                            : "The trip organizer hasn't added any itinerary items yet."}
                        </p>
                        
                        {trip._accessLevel === 'owner' && (
                          <Button
                            onClick={() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] });
                            }}
                          >
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add First Itinerary Item
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
                      <CardTitle>Expenses</CardTitle>
                      <CardDescription>
                        {expenses && expenses.length > 0 
                          ? `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"} recorded` 
                          : "No expenses recorded yet"}
                      </CardDescription>
                    </div>
                    
                    <ExpenseForm 
                      tripId={tripId}
                      groupMembers={groupMembers || []}
                      users={users || []} 
                      onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "expenses"] });
                      }}
                      onCancel={() => {}}
                    />
                  </CardHeader>
                  <CardContent>
                    {isLoadingExpenses ? (
                      <div className="space-y-4">
                        {[...Array(2)].map((_, i) => (
                          <Card key={i}>
                            <CardContent className="p-4">
                              <div className="flex items-start space-x-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-5 w-1/3" />
                                  <Skeleton className="h-4 w-2/3" />
                                  <div className="flex space-x-2">
                                    <Skeleton className="h-4 w-16" />
                                    <Skeleton className="h-4 w-16" />
                                  </div>
                                </div>
                                <Skeleton className="h-8 w-24" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : expenses && expenses.length > 0 ? (
                      <div className="space-y-4">
                        {expenses.map(expense => (
                          <ExpenseCard 
                            key={expense.id} 
                            expense={expense}
                            users={users || []}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <DollarSign className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-neutral-900 mb-1">No expenses</h3>
                        <p className="text-neutral-500 mb-6 max-w-md mx-auto">
                          Track expenses for this trip to help with budgeting and cost sharing.
                        </p>
                        
                        <Button
                          onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "expenses"] });
                          }}
                        >
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Add First Expense
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Vehicles tab */}
              <TabsContent value="vehicles">
                <TripVehicleList 
                  tripId={tripId} 
                  accessLevel={trip._accessLevel || 'member'} 
                />
              </TabsContent>
              
              {/* Drivers tab */}
              <TabsContent value="drivers">
                <Card>
                  <CardHeader>
                    <CardTitle>Driver Information</CardTitle>
                    <CardDescription>
                      Manage driver assignments and license information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Driver info section */}
                    <div className="mb-8">
                      <h3 className="font-medium text-neutral-800 mb-3">My Driver Information</h3>
                      <DriverInfoSection 
                        user={user!}
                        tripId={tripId}
                        accessLevel={trip._accessLevel as 'owner' | 'member'} 
                      />
                    </div>
                    
                    {/* Driver assignment section */}
                    {trip && trip._accessLevel && (
                      <TripDriverAssignment 
                        tripId={tripId} 
                        accessLevel={trip._accessLevel} 
                      />
                    )}
                  </CardContent>
                </Card>
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