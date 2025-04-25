import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trip, ItineraryItem, Expense, User } from "@shared/schema";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { 
  Calendar, MapPin, Users, PlusIcon, PencilIcon, 
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

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAddingItinerary, setIsAddingItinerary] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);

  // Get trip details
  const { data: trip, isLoading: isLoadingTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });

  // Get itinerary items
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/trips", tripId, "itinerary"],
    enabled: !!tripId,
  });

  // Get expenses
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: ["/api/trips", tripId, "expenses"],
    enabled: !!tripId,
  });

  // Get group members
  const { data: groupMembers, isLoading: isLoadingGroupMembers } = useQuery({
    queryKey: ["/api/groups", trip?.groupId, "members"],
    enabled: !!trip?.groupId,
  });

  // Get all users for names and avatars
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!groupMembers,
  });

  // Group itinerary items by day
  const itemsByDay = itineraryItems?.reduce((acc, item) => {
    if (!acc[item.day]) {
      acc[item.day] = [];
    }
    acc[item.day].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>) || {};

  // Format date range
  const formatDateRange = (startDate: Date, endDate: Date) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
    }
    
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    
    return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
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
              {groupMembers?.length || 0} travelers
            </div>
          </div>
        </div>
        
        {/* Trip content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Itinerary and expenses */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="itinerary">
              <TabsList>
                <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="info">Trip Info</TabsTrigger>
              </TabsList>
              
              {/* Itinerary tab */}
              <TabsContent value="itinerary">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Trip Itinerary</CardTitle>
                    {!isAddingItinerary && (
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
                        <Button onClick={() => setIsAddingItinerary(true)}>
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Add First Item
                        </Button>
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
                    {!isAddingExpense && (
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
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
                        <h3 className="text-lg font-medium text-neutral-700 mb-1">No expenses added yet</h3>
                        <p className="text-neutral-500 mb-6">Track your trip spending by adding expenses</p>
                        <Button onClick={() => setIsAddingExpense(true)}>
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Add First Expense
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Trip Info tab */}
              <TabsContent value="info">
                <Card>
                  <CardHeader>
                    <CardTitle>Trip Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {trip.description ? (
                      <div className="mb-6">
                        <h3 className="font-medium text-neutral-800 mb-2">Description</h3>
                        <p className="text-neutral-600">{trip.description}</p>
                      </div>
                    ) : (
                      <div className="mb-6">
                        <h3 className="font-medium text-neutral-800 mb-2">Description</h3>
                        <p className="text-neutral-500 italic">No description added</p>
                      </div>
                    )}
                    
                    <div className="mb-6">
                      <h3 className="font-medium text-neutral-800 mb-2">Date</h3>
                      <div className="flex items-center text-neutral-600">
                        <Calendar className="h-4 w-4 mr-2 text-neutral-500" />
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-medium text-neutral-800 mb-2">Location</h3>
                      <div className="flex items-center text-neutral-600">
                        <MapPin className="h-4 w-4 mr-2 text-neutral-500" />
                        {trip.destination}
                      </div>
                    </div>
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
                {isLoadingGroupMembers ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded-full mr-3" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : groupMembers && groupMembers.length > 0 ? (
                  <div className="space-y-4">
                    {groupMembers.map(member => {
                      const memberUser = users?.find(u => u.id === member.userId);
                      return (
                        <div key={member.id} className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mr-3">
                            {memberUser?.displayName?.[0] || memberUser?.username?.[0] || "U"}
                          </div>
                          <div>
                            <p className="font-medium text-neutral-800">
                              {memberUser?.displayName || memberUser?.username || "Unknown User"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Users className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
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
