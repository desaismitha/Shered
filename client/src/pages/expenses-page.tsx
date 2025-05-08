import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Expense, Trip, User, GroupMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, DollarSign, Filter, CalendarClock } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export default function ExpensesPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [tripFilter, setTripFilter] = useState<string>("all");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const { user } = useAuth();
  
  // Get all expenses
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Get all trips for filter
  const { data: trips, isLoading: isLoadingTrips } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  // Get all users for expense details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  
  // Get group members for the selected trip's group
  const { data: selectedTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", selectedTripId],
    enabled: !!selectedTripId,
  });
  
  const { data: groupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", selectedTrip?.groupId, "members"],
    enabled: !!selectedTrip?.groupId,
  });

  // Filter expenses based on search query and trip filter
  const filteredExpenses = expenses?.filter(expense => {
    const matchesSearch = 
      searchQuery === "" || 
      expense.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.category?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTrip = tripFilter === "all" || expense.tripId.toString() === tripFilter;
    
    return matchesSearch && matchesTrip;
  });

  // Calculate total expenses
  const totalExpenses = filteredExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-1">
              Expenses
            </h1>
            <p className="text-neutral-500">
              Track and manage your travel expenses
            </p>
          </div>
          
          <div className="mt-4 md:mt-0 flex items-center">
            <p className="text-xl font-semibold text-neutral-800 mr-4">
              Total: ${(totalExpenses / 100).toFixed(2)}
            </p>
            <Button 
              onClick={() => setExpenseDialogOpen(true)}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </div>
          
          {/* Add Expense Dialog */}
          <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Expense</DialogTitle>
                <DialogDescription>
                  Select a trip to associate with this expense
                </DialogDescription>
              </DialogHeader>
              
              {!selectedTripId ? (
                <div className="space-y-4 py-4">
                  <div className="flex items-center">
                    <CalendarClock className="mr-2 h-5 w-5 text-primary-500" />
                    <h3 className="text-lg font-medium">Select Trip</h3>
                  </div>
                  
                  <div className="grid gap-4">
                    {isLoadingTrips ? (
                      <div className="flex justify-center p-4">
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : trips && trips.length > 0 ? (
                      trips.map(trip => (
                        <Card 
                          key={trip.id} 
                          className="cursor-pointer hover:bg-neutral-50"
                          onClick={() => setSelectedTripId(trip.id)}
                        >
                          <CardContent className="p-4 flex justify-between items-center">
                            <div>
                              <h4 className="font-medium">{trip.name || 'Unnamed trip'}</h4>
                              <p className="text-sm text-neutral-500">
                                {trip.destination}
                              </p>
                            </div>
                            <PlusIcon className="h-5 w-5 text-primary-500" />
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center p-4">
                        <p className="mb-4">No trips found to associate expenses with</p>
                        <Button 
                          onClick={() => navigate("/trips/new")}
                          className="inline-flex items-center"
                        >
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Create a Trip First
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-4">
                  <div className="mb-4 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium">
                        {trips?.find(t => t.id === selectedTripId)?.name || 'Selected Trip'}
                      </h3>
                      <p className="text-sm text-neutral-500">
                        {trips?.find(t => t.id === selectedTripId)?.destination}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedTripId(null)}
                    >
                      Change Trip
                    </Button>
                  </div>
                  
                  <ExpenseForm 
                    tripId={selectedTripId} 
                    groupMembers={groupMembers || []} 
                    users={users || []}
                    onSuccess={() => {
                      setExpenseDialogOpen(false);
                      setSelectedTripId(null);
                    }}
                    onCancel={() => {
                      setExpenseDialogOpen(false);
                      setSelectedTripId(null);
                    }}
                  />
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search expenses"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="w-full md:w-64">
            <Select 
              value={tripFilter} 
              onValueChange={setTripFilter}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by trip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trips</SelectItem>
                {trips?.map(trip => (
                  <SelectItem key={trip.id} value={trip.id.toString()}>
                    {trip.destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoadingExpenses ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white shadow rounded-lg overflow-hidden p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-4 w-full mb-4" />
                <div className="flex justify-between items-center">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredExpenses && filteredExpenses.length > 0 ? (
          <div className="space-y-4">
            {filteredExpenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(expense => (
                <div key={expense.id} className="relative">
                  {tripFilter === "all" && trips && (
                    <div className="absolute top-4 right-4 z-10">
                      <Badge className="bg-neutral-100 text-neutral-800 hover:bg-neutral-200">
                        {trips.find(t => t.id === expense.tripId)?.destination || "Unknown Trip"}
                      </Badge>
                    </div>
                  )}
                  <ExpenseCard expense={expense} users={users || []} />
                </div>
              ))
            }
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <DollarSign className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">
              {searchQuery || tripFilter !== "all" 
                ? "No matching expenses found" 
                : "No expenses yet"}
            </h3>
            <p className="text-neutral-500 mb-6">
              {searchQuery || tripFilter !== "all" 
                ? "Try adjusting your filters" 
                : "Start tracking your trip expenses"}
            </p>
            <Button 
              onClick={() => setExpenseDialogOpen(true)}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add First Expense
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
