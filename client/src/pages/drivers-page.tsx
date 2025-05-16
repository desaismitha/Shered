import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { 
  Calendar, 
  CheckCircle, 
  Calendar as CalendarIcon, 
  Check,
  CarTaxiFront, 
  Car,
  Plus,
  Edit,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { LoadingFallback } from "@/components/ui/loading-fallback";
import { AppShell } from "@/components/layout/app-shell";

type DriverAssignment = {
  id: number;
  tripId: number;
  tripName?: string;
  driverId: number;
  driverName?: string;
  vehicleId: number | null;
  vehicleName?: string;
  startDate: string;
  endDate: string;
  isRecurring: boolean;
  recurrencePattern: string | null;
  recurrenceDays: string | null;
  notes: string | null;
  status: string;
  assignedBy: number;
  assignerName?: string;
};

type User = {
  id: number;
  username: string;
  displayName: string;
  isEligibleDriver: boolean;
};

type Vehicle = {
  id: number;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string | null;
  color: string | null;
  capacity: number;
};

export default function DriversPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isDriverDialogOpen, setIsDriverDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DriverAssignment | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>("daily");
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>([]);
  const [assignmentStartDate, setAssignmentStartDate] = useState<Date | undefined>(new Date());
  const [assignmentEndDate, setAssignmentEndDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [activeTab, setActiveTab] = useState<string>("all");
  
  // Fetch all driver assignments
  const { data: assignments, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ["/api/driver-assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/driver-assignments");
      const data = await res.json();
      return data as DriverAssignment[];
    },
  });

  // Fetch eligible drivers (users with isEligibleDriver=true)
  const { data: eligibleDrivers, isLoading: isLoadingDrivers } = useQuery({
    queryKey: ["/api/users/eligible-drivers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/eligible-drivers");
      const data = await res.json();
      return data as User[];
    },
  });

  // Fetch vehicles
  const { data: vehicles, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["/api/vehicles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vehicles");
      const data = await res.json();
      return data as Vehicle[];
    },
  });

  // Fetch all trips/schedules for dropdown
  const { data: trips, isLoading: isLoadingTrips } = useQuery({
    queryKey: ["/api/schedules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/schedules");
      const data = await res.json();
      return data;
    },
  });

  // Create driver assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/trips/${data.tripId}/driver-assignments`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Created",
        description: "The driver has been successfully assigned to this schedule.",
      });
      setIsDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/driver-assignments"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create driver assignment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update driver assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, tripId, data }: { id: number; tripId: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/trips/${tripId}/driver-assignments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Updated",
        description: "The driver assignment has been successfully updated.",
      });
      setIsDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/driver-assignments"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update driver assignment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete driver assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async ({ id, tripId }: { id: number; tripId: number }) => {
      await apiRequest("DELETE", `/api/trips/${tripId}/driver-assignments/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Removed",
        description: "The driver assignment has been successfully removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/driver-assignments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove driver assignment. Please try again.",
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setSelectedDriverId("");
    setSelectedVehicleId("");
    setSelectedTripId("");
    setAssignmentNotes("");
    setIsRecurring(false);
    setRecurrencePattern("daily");
    setRecurrenceDays([]);
    setSelectedAssignment(null);
    setAssignmentStartDate(new Date());
    setAssignmentEndDate(addDays(new Date(), 1));
  }

  function handleCreateAssignment() {
    if (!selectedDriverId) {
      toast({
        title: "Error",
        description: "Please select a driver",
        variant: "destructive",
      });
      return;
    }

    if (!selectedTripId) {
      toast({
        title: "Error",
        description: "Please select a schedule",
        variant: "destructive",
      });
      return;
    }

    if (!assignmentStartDate || !assignmentEndDate) {
      toast({
        title: "Error",
        description: "Please select start and end dates",
        variant: "destructive",
      });
      return;
    }

    const data = {
      driverId: parseInt(selectedDriverId),
      vehicleId: selectedVehicleId ? parseInt(selectedVehicleId) : null,
      startDate: assignmentStartDate.toISOString(),
      endDate: assignmentEndDate.toISOString(),
      isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      recurrenceDays: isRecurring && recurrencePattern === "specific-days" ? JSON.stringify(recurrenceDays) : null,
      notes: assignmentNotes || null,
      assignedBy: user?.id,
      status: "scheduled",
    };

    if (selectedAssignment) {
      updateAssignmentMutation.mutate({ 
        id: selectedAssignment.id, 
        tripId: selectedAssignment.tripId,
        data 
      });
    } else {
      createAssignmentMutation.mutate({
        ...data,
        tripId: parseInt(selectedTripId)
      });
    }
  }

  function handleEditAssignment(assignment: DriverAssignment) {
    setSelectedAssignment(assignment);
    setSelectedDriverId(assignment.driverId.toString());
    setSelectedVehicleId(assignment.vehicleId?.toString() || "");
    setSelectedTripId(assignment.tripId.toString());
    setAssignmentNotes(assignment.notes || "");
    setIsRecurring(assignment.isRecurring);
    setRecurrencePattern(assignment.recurrencePattern || "daily");
    setRecurrenceDays(assignment.recurrenceDays ? JSON.parse(assignment.recurrenceDays) : []);
    setAssignmentStartDate(new Date(assignment.startDate));
    setAssignmentEndDate(new Date(assignment.endDate));
    setIsDriverDialogOpen(true);
  }

  function handleDeleteAssignment(assignment: DriverAssignment) {
    if (confirm("Are you sure you want to remove this driver assignment?")) {
      deleteAssignmentMutation.mutate({ 
        id: assignment.id, 
        tripId: assignment.tripId 
      });
    }
  }

  const days = [
    { value: "mon", label: "Monday" },
    { value: "tue", label: "Tuesday" },
    { value: "wed", label: "Wednesday" },
    { value: "thu", label: "Thursday" },
    { value: "fri", label: "Friday" },
    { value: "sat", label: "Saturday" },
    { value: "sun", label: "Sunday" },
  ];

  // Filter assignments based on the selected date and tab
  const filteredAssignments = assignments?.filter(assignment => {
    if (!selectedDate) return false;
    
    const start = new Date(assignment.startDate);
    const end = new Date(assignment.endDate);
    
    // Basic date filter
    const dateMatch = selectedDate >= start && selectedDate <= end;
    
    // Check recurrence pattern if applicable
    let recurrenceMatch = true;
    if (dateMatch && assignment.isRecurring) {
      const dayOfWeek = format(selectedDate, "EEE").toLowerCase();
      
      switch (assignment.recurrencePattern) {
        case "daily":
          recurrenceMatch = true;
          break;
        case "weekdays":
          recurrenceMatch = ["mon", "tue", "wed", "thu", "fri"].includes(dayOfWeek);
          break;
        case "weekends":
          recurrenceMatch = ["sat", "sun"].includes(dayOfWeek);
          break;
        case "specific-days":
          if (assignment.recurrenceDays) {
            const days = JSON.parse(assignment.recurrenceDays);
            recurrenceMatch = days.includes(dayOfWeek);
          } else {
            recurrenceMatch = false;
          }
          break;
        default:
          recurrenceMatch = false;
      }
    }
    
    // Apply tab filter
    const statusMatch = 
      activeTab === "all" ? true :
      activeTab === "scheduled" ? assignment.status === "scheduled" :
      activeTab === "completed" ? assignment.status === "completed" :
      activeTab === "cancelled" ? assignment.status === "cancelled" :
      true;
    
    return dateMatch && recurrenceMatch && statusMatch;
  });

  if (isLoadingAssignments || isLoadingDrivers || isLoadingVehicles || isLoadingTrips) {
    return <LoadingFallback />;
  }

  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Driver Assignments</h1>
            <p className="text-neutral-500">Manage driver and runner assignments for schedules</p>
          </div>
          <Button 
            onClick={() => {
              setSelectedAssignment(null);
              resetForm();
              setIsDriverDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Driver Assignment
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column - Calendar */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Select Date</CardTitle>
                <CardDescription>View assignments by date</CardDescription>
              </CardHeader>
              <CardContent>
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="border rounded-md"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right column - Assignments list */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Driver Assignments</CardTitle>
                    <CardDescription>
                      {selectedDate ? `For ${format(selectedDate, "PPP")}` : "Select a date"}
                    </CardDescription>
                  </div>
                  
                  <Tabs defaultValue="all" onValueChange={setActiveTab} value={activeTab}>
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                      <TabsTrigger value="completed">Completed</TabsTrigger>
                      <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {filteredAssignments && filteredAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {filteredAssignments.map((assignment) => {
                      const driver = eligibleDrivers?.find(d => d.id === assignment.driverId);
                      const vehicle = vehicles?.find(v => v.id === assignment.vehicleId);
                      const trip = trips?.find((t: any) => t.id === assignment.tripId);
                      
                      return (
                        <Card key={assignment.id} className="border border-muted">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg mb-1">
                                  {driver?.displayName || `Driver #${assignment.driverId}`}
                                  {vehicle && (
                                    <span className="ml-2 text-sm font-normal text-neutral-500">
                                      ({vehicle.make} {vehicle.model})
                                    </span>
                                  )}
                                </CardTitle>
                                <CardDescription>
                                  {trip ? trip.name : `Schedule #${assignment.tripId}`}
                                </CardDescription>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleEditAssignment(assignment)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteAssignment(assignment)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="py-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="text-neutral-500">
                                <Calendar className="h-4 w-4 inline-block mr-1" />
                                <span>
                                  {format(new Date(assignment.startDate), "PPP")} to {format(new Date(assignment.endDate), "PPP")}
                                </span>
                              </div>
                              <div>
                                <span 
                                  className={
                                    assignment.status === "scheduled" ? "text-blue-500" :
                                    assignment.status === "completed" ? "text-green-500" :
                                    "text-red-500"
                                  }
                                >
                                  {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
                                </span>
                              </div>
                            </div>

                            {assignment.isRecurring && (
                              <div className="text-sm text-neutral-500 mt-2">
                                <span className="font-medium">Recurring:</span>{" "}
                                {assignment.recurrencePattern === "daily" && "Daily"}
                                {assignment.recurrencePattern === "weekdays" && "Weekdays (Mon-Fri)"}
                                {assignment.recurrencePattern === "weekends" && "Weekends (Sat-Sun)"}
                                {assignment.recurrencePattern === "specific-days" && 
                                  `${JSON.parse(assignment.recurrenceDays || "[]")
                                    .map((day: string) => day.charAt(0).toUpperCase() + day.slice(1))
                                    .join(", ")}`
                                }
                              </div>
                            )}

                            {assignment.notes && (
                              <div className="text-sm text-neutral-500 mt-2">
                                <span className="font-medium">Notes:</span> {assignment.notes}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <CarTaxiFront className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
                    <h3 className="text-lg font-medium text-neutral-900 mb-1">No driver assignments found</h3>
                    <p className="text-neutral-500 mb-4">
                      {selectedDate 
                        ? `There are no driver assignments for ${format(selectedDate, "PPP")}`
                        : "Select a date to view driver assignments"
                      }
                    </p>
                    <Button 
                      onClick={() => {
                        setSelectedAssignment(null);
                        resetForm();
                        setIsDriverDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Driver Assignment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Driver Assignment Dialog */}
      <Dialog open={isDriverDialogOpen} onOpenChange={setIsDriverDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedAssignment ? "Edit Driver Assignment" : "Add Driver Assignment"}
            </DialogTitle>
            <DialogDescription>
              {selectedAssignment 
                ? "Update the driver assignment details" 
                : "Assign a driver to a schedule"
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule</Label>
                <Select 
                  disabled={!!selectedAssignment}
                  value={selectedTripId} 
                  onValueChange={setSelectedTripId}
                >
                  <SelectTrigger id="schedule">
                    <SelectValue placeholder="Select a schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Schedules</SelectLabel>
                      {trips?.map((trip: any) => (
                        <SelectItem key={trip.id} value={trip.id.toString()}>
                          {trip.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="driver">Driver</Label>
                <Select 
                  value={selectedDriverId} 
                  onValueChange={setSelectedDriverId}
                >
                  <SelectTrigger id="driver">
                    <SelectValue placeholder="Select a driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Drivers</SelectLabel>
                      {eligibleDrivers?.map(driver => (
                        <SelectItem key={driver.id} value={driver.id.toString()}>
                          {driver.displayName || driver.username}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicle">Vehicle (Optional)</Label>
                <Select 
                  value={selectedVehicleId} 
                  onValueChange={setSelectedVehicleId}
                >
                  <SelectTrigger id="vehicle">
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Vehicles</SelectLabel>
                      <SelectItem value="none">No vehicle</SelectItem>
                      {vehicles?.map(vehicle => (
                        <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                          {vehicle.make} {vehicle.model} {vehicle.year} {vehicle.color && `(${vehicle.color})`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        id="startDate"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {assignmentStartDate ? format(assignmentStartDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={assignmentStartDate}
                        onSelect={setAssignmentStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        id="endDate"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {assignmentEndDate ? format(assignmentEndDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={assignmentEndDate}
                        onSelect={setAssignmentEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isRecurring"
                  checked={isRecurring}
                  onCheckedChange={(checked) => setIsRecurring(checked === true)}
                />
                <Label htmlFor="isRecurring">Recurring Assignment</Label>
              </div>
              
              {isRecurring && (
                <div className="space-y-2">
                  <Label htmlFor="recurrencePattern">Recurrence Pattern</Label>
                  <Select 
                    value={recurrencePattern} 
                    onValueChange={setRecurrencePattern}
                  >
                    <SelectTrigger id="recurrencePattern">
                      <SelectValue placeholder="Select recurrence pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
                      <SelectItem value="weekends">Weekends (Sat-Sun)</SelectItem>
                      <SelectItem value="specific-days">Specific Days</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {recurrencePattern === "specific-days" && (
                    <div className="space-y-2 mt-2">
                      <Label>Select Days</Label>
                      <div className="flex flex-wrap gap-2">
                        {days.map((day) => (
                          <div key={day.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`day-${day.value}`}
                              checked={recurrenceDays.includes(day.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setRecurrenceDays([...recurrenceDays, day.value]);
                                } else {
                                  setRecurrenceDays(recurrenceDays.filter(d => d !== day.value));
                                }
                              }}
                            />
                            <Label htmlFor={`day-${day.value}`}>{day.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="Add any additional notes or instructions"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDriverDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAssignment}
              disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
            >
              {createAssignmentMutation.isPending || updateAssignmentMutation.isPending ? (
                "Saving..."
              ) : selectedAssignment ? (
                "Update Assignment"
              ) : (
                "Create Assignment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}