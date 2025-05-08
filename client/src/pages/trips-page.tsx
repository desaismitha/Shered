import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Expense, Trip, User, GroupMember } from "@shared/schema";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, DollarSign, ReceiptIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTripForExpense, setSelectedTripForExpense] = useState<Trip | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const { user } = useAuth();
  
  // Get all trips
  const { data: trips, isLoading, refetch } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    staleTime: 0,
    gcTime: 0, // Don't keep old data in cache at all
    refetchOnMount: "always", // Always refetch on mount
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Get all expenses
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Get all users for expense details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Debug logging for trips data
  console.log("Trips data from API:", trips);
  console.log("All expenses:", expenses);
  console.log("Total expenses calculated:", expenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0);

  // Type guard for Trip objects
  const hasTripDisplayFields = (trip: any): trip is Trip & { 
    startLocationDisplay?: string; 
    destinationDisplay?: string;
  } => {
    return trip && typeof trip === 'object';
  };

  // Filter trips based on search query and status
  const filteredTrips = trips?.filter(trip => {
    // Use type guard to check for display fields
    const tripWithDisplay = hasTripDisplayFields(trip);
    
    const matchesSearch = 
      searchQuery === "" || 
      (trip.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (trip.destination && trip.destination.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (trip.startLocation && trip.startLocation.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tripWithDisplay.destinationDisplay && tripWithDisplay.destinationDisplay.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tripWithDisplay.startLocationDisplay && tripWithDisplay.startLocationDisplay.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || trip.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Debug logging for filtered trips
  console.log("Filtered trips:", filteredTrips);

  // Group trips by status
  const upcomingTrips = filteredTrips?.filter(trip => {
    if (!trip.startDate) return false;
    try {
      const now = new Date();
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);

      // Trip has a current status that indicates it's upcoming or in progress
      const hasActiveStatus = trip.status === "planning" || trip.status === "confirmed" || trip.status === "in-progress";
      
      // Trip is not marked as cancelled or completed
      const isNotFinished = trip.status !== "cancelled" && trip.status !== "completed";
      
      // A trip is "upcoming" if it is planning/confirmed regardless of start date
      // (The auto-update system will take care of changing status when start time is reached)
      const isUpcoming = (trip.status === "planning" || trip.status === "confirmed");
      
      // A trip is "in progress" if it has that status regardless of start/end times
      // We used to check: trip.status === "in-progress" && startDate <= now && endDate > now
      // But this was causing issues with trips not showing up when they should
      const isActiveNow = trip.status === "in-progress";
      
      // For debugging
      console.log(`Trip ${trip.id} (${trip.name}): isUpcoming=${isUpcoming}, isActiveNow=${isActiveNow}, status=${trip.status}`);
      
      return (isUpcoming || isActiveNow) && isNotFinished && hasActiveStatus;
    } catch (e) {
      console.error("Error parsing date:", trip.startDate);
      return false;
    }
  });
  
  console.log("Upcoming trips count:", upcomingTrips?.length || 0);
  
  const pastTrips = filteredTrips?.filter(trip => {
    if (!trip.endDate) return false;
    try {
      const now = new Date();
      const endDate = new Date(trip.endDate);
      
      // A trip is considered "past" if it's completed (by status)
      // OR if its end date is in the past AND it's not cancelled
      const isCompleted = trip.status === "completed";
      const isPastEndDate = endDate < now && trip.status !== "cancelled";
      
      // Also mark in-progress trips whose end date has passed as "past"
      const isOverdueInProgress = trip.status === "in-progress" && endDate < now;
      
      // For debugging
      console.log(`Trip ${trip.id} (${trip.name}): isCompleted=${isCompleted}, isPastEndDate=${isPastEndDate}, isOverdueInProgress=${isOverdueInProgress}`);
      
      return isCompleted || isPastEndDate || isOverdueInProgress;
    } catch (e) {
      console.error("Error parsing date:", trip.endDate);
      return false;
    }
  });
  
  console.log("Past trips:", pastTrips);

  const cancelledTrips = filteredTrips?.filter(trip => 
    trip.status === "cancelled"
  );
  
  console.log("Cancelled trips:", cancelledTrips);

  // Filter expenses for the current tab
  const upcomingTripIds = upcomingTrips?.map(trip => trip.id) || [];
  const pastTripIds = pastTrips?.map(trip => trip.id) || [];
  const cancelledTripIds = cancelledTrips?.map(trip => trip.id) || [];
  
  // Get expenses for the currently active tab
  const getExpensesByTab = (tabValue: string) => {
    if (!expenses) return [];
    
    let relevantTripIds: number[] = [];
    if (tabValue === "upcoming") relevantTripIds = upcomingTripIds;
    else if (tabValue === "past") relevantTripIds = pastTripIds;
    else if (tabValue === "cancelled") relevantTripIds = cancelledTripIds;
    
    return expenses.filter(expense => relevantTripIds.includes(expense.tripId));
  };

  // Calculate total expenses
  const calculateTotalForTab = (tabValue: string) => {
    const relevantExpenses = getExpensesByTab(tabValue);
    return relevantExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  };

  // Get group members for the selected trip's group
  const { data: groupMembers, isLoading: isLoadingGroupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", selectedTripForExpense?.groupId, "members"],
    enabled: !!selectedTripForExpense?.groupId, // Only run the query if we have a selected trip with a group
  });
  
  // Function to get group members for the selected trip
  const getGroupMembersForTrip = (trip: Trip | null): GroupMember[] => {
    if (!trip) return [];
    
    // If the trip has a group, use the fetched group members
    if (trip.groupId && groupMembers) {
      return groupMembers;
    }
    
    // If the trip doesn't have a group or we're still loading group members,
    // return just the current user as a temporary group member
    return [
      { id: 1, groupId: trip.groupId || 0, userId: user?.id || 0, role: "member" } as GroupMember
    ];
  };

  // Function to open expense dialog for a specific trip
  const openExpenseDialog = (trip: Trip) => {
    setSelectedTripForExpense(trip);
    setExpenseDialogOpen(true);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">
              My Trips
            </h1>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                console.log("Manually refreshing trips data");
                refetch();
              }}
              className="h-9 w-9 text-lg font-bold"
              title="Refresh trips"
            >
              ↻
            </Button>
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            <Button 
              variant="outline"
              onClick={() => navigate("/expenses")}
              className="inline-flex items-center"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              View All Expenses
            </Button>
            <Button 
              onClick={() => navigate("/trips/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create New Trip
            </Button>
          </div>
        </div>
        
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search trips by title or location"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <Tabs defaultValue="upcoming" className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="upcoming" onClick={() => setStatusFilter("all")}>
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="past" onClick={() => setStatusFilter("all")}>
              Past
            </TabsTrigger>
            <TabsTrigger value="cancelled" onClick={() => setStatusFilter("cancelled")}>
              Cancelled
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upcoming">
            {/* Expenses Summary Card for Upcoming Trips */}
            {!isLoading && !isLoadingExpenses && upcomingTrips && upcomingTrips.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <ReceiptIcon className="h-5 w-5 mr-2" />
                    Trip Expenses
                  </CardTitle>
                  <span className="text-lg font-medium">
                    Total: ${(calculateTotalForTab("upcoming") / 100).toFixed(2)}
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getExpensesByTab("upcoming").length > 0 ? (
                      <div className="space-y-3">
                        {getExpensesByTab("upcoming")
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 3) // Show only the 3 most recent expenses
                          .map(expense => (
                            <ExpenseCard key={expense.id} expense={expense} users={users || []} />
                          ))
                        }
                        {getExpensesByTab("upcoming").length > 3 && (
                          <div className="text-center mt-2">
                            <Button 
                              variant="link" 
                              onClick={() => navigate("/expenses")}
                            >
                              View all {getExpensesByTab("upcoming").length} expenses
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-3">
                        No expenses recorded for your upcoming trips yet.
                      </p>
                    )}
                    <div className="mt-4 flex justify-end">
                      <Button 
                        onClick={() => {
                          if (upcomingTrips.length === 1) {
                            // If there's only one trip, select it automatically
                            openExpenseDialog(upcomingTrips[0]);
                          } else {
                            // If there are multiple trips, navigate to expenses page
                            navigate("/expenses");
                          }
                        }}
                        className="inline-flex items-center"
                        variant="outline"
                        size="sm"
                      >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Expense
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingTrips && upcomingTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingTrips.map((trip) => (
                  <div key={trip.id} className="relative group">
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openExpenseDialog(trip);
                        }}
                        className="shadow-md"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Add Expense
                      </Button>
                    </div>
                    <TripCard key={trip.id} trip={trip} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No upcoming trips</h3>
                <p className="text-neutral-500 mb-4">Start planning your next adventure!</p>
                <Button 
                  onClick={() => navigate("/trips/new")}
                  className="inline-flex items-center"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Trip
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="past">
            {/* Expenses Summary Card for Past Trips */}
            {!isLoading && !isLoadingExpenses && pastTrips && pastTrips.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <ReceiptIcon className="h-5 w-5 mr-2" />
                    Trip Expenses
                  </CardTitle>
                  <span className="text-lg font-medium">
                    Total: ${(calculateTotalForTab("past") / 100).toFixed(2)}
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getExpensesByTab("past").length > 0 ? (
                      <div className="space-y-3">
                        {getExpensesByTab("past")
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 3) // Show only the 3 most recent expenses
                          .map(expense => (
                            <ExpenseCard key={expense.id} expense={expense} users={users || []} />
                          ))
                        }
                        {getExpensesByTab("past").length > 3 && (
                          <div className="text-center mt-2">
                            <Button 
                              variant="link" 
                              onClick={() => navigate("/expenses")}
                            >
                              View all {getExpensesByTab("past").length} expenses
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-3">
                        No expenses recorded for your past trips.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pastTrips && pastTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No past trips</h3>
                <p className="text-neutral-500">Your completed trips will appear here</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="cancelled">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-7 w-7 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : cancelledTrips && cancelledTrips.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cancelledTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No cancelled trips</h3>
                <p className="text-neutral-500">Cancelled trips will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Expense for Trip</DialogTitle>
            <DialogDescription>
              {selectedTripForExpense?.name} - {selectedTripForExpense?.destination}
            </DialogDescription>
          </DialogHeader>

          {selectedTripForExpense && (
            <ExpenseForm
              tripId={selectedTripForExpense.id}
              groupMembers={getGroupMembersForTrip(selectedTripForExpense)}
              users={users || []}
              onSuccess={() => setExpenseDialogOpen(false)}
              onCancel={() => setExpenseDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
