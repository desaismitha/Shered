import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trip as BaseTrip, ItineraryItem, Expense, User, GroupMember } from "@shared/schema";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  Calendar, CalendarRange, MapPin, Users, PlusIcon, PencilIcon, 
  DollarSign, ClipboardList, Info, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ItineraryItem as ItineraryItemComponent } from "@/components/itinerary/itinerary-item";
import { ItineraryForm } from "@/components/itinerary/itinerary-form";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { ExpenseForm } from "@/components/expenses/expense-form";
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
  const [status, setStatus] = useState(trip.status || 'planning');
  
  // Simplified date handling - directly use string values in ISO format
  const formatDefaultDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '';
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
      
      // Create full payload with explicit null values for dates
      const payload = {
        name,
        destination,
        status,
        startDate: startDate ? `${startDate}T12:00:00Z` : null,
        endDate: endDate ? `${endDate}T12:00:00Z` : null
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAddingItinerary, setIsAddingItinerary] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Get trip details directly from the specific endpoint to get access level info
  const { data: trip, isLoading: isLoadingTrip, refetch: refetchTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });
  
  // Debug the trip access level
  useEffect(() => {
    if (trip) {
      console.log("Trip access level:", trip._accessLevel);
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

  // Group itinerary items by day
  const itemsByDay = itineraryItems?.reduce((acc, item) => {
    // Skip items that don't have a valid day value
    if (item.day === null || item.day === undefined) {
      return acc;
    }
    
    const day = item.day;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>) || {};

  // Format date range
  const formatDateRange = (startDate: string | Date | null | undefined, endDate: string | Date | null | undefined) => {
    // Check for the special case date (2099-12-31) which we use to indicate "no date"
    if (startDate && typeof startDate === 'string' && startDate.includes('2099')) {
      return "Date not specified";
    }
    
    // Handle null or undefined dates
    if (!startDate || !endDate) {
      return "Date not specified";
    }
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check for special placeholder dates
      if (start.getFullYear() >= 2099 || end.getFullYear() >= 2099) {
        return "Date not specified";
      }
      
      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return "Invalid date range";
      }
      
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
      }
      
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
      }
      
      return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
    } catch (error) {
      console.error("Error formatting date range:", error, startDate, endDate);
      return "Error formatting dates";
    }
  };

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

  return (
    <AppShell>
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
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Trip Info</TabsTrigger>
                <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
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
                        <Button 
                          size="sm"
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                          onClick={() => navigate(`/trips/basic-edit/${trip.id}`)}
                        >
                          <CalendarRange className="h-4 w-4 mr-2" />
                          Simple Edit
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
                                <div className="p-4 border-b md:border-b-0 md:border-r">
                                  <p className="text-sm text-neutral-500 mb-1">Start Date</p>
                                  <p className="font-medium">
                                    {trip.startDate && !String(trip.startDate).includes('2099') 
                                      ? format(new Date(trip.startDate), 'MMMM d, yyyy') 
                                      : 'Not specified'}
                                  </p>
                                </div>
                                <div className="p-4">
                                  <p className="text-sm text-neutral-500 mb-1">End Date</p>
                                  <p className="font-medium">
                                    {trip.endDate ? format(new Date(trip.endDate), 'MMMM d, yyyy') : 'Not specified'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
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
                    {!isAddingItinerary && trip._accessLevel && (
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
                    {isAddingItinerary ? (
                      <>
                        <ItineraryForm 
                          tripId={tripId} 
                          onSuccess={() => setIsAddingItinerary(false)}
                          onCancel={() => setIsAddingItinerary(false)}
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