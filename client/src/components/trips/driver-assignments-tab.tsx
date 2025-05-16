import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { format, parse, addDays } from "date-fns";
import { 
  Calendar, 
  AlertCircle, 
  Calendar as CalendarIcon, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Car, 
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LoadingFallback } from "@/components/ui/loading-fallback";

type DriverAssignment = {
  id: number;
  tripId: number;
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

interface DriverAssignmentsTabProps {
  tripId: number;
  tripName: string;
  startDate?: string;
  endDate?: string;
}

export function DriverAssignmentsTab({ tripId, tripName, startDate, endDate }: DriverAssignmentsTabProps) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isDriverDialogOpen, setIsDriverDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DriverAssignment | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>("daily");
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>([]);
  const [assignmentStartDate, setAssignmentStartDate] = useState<Date | undefined>(
    startDate ? new Date(startDate) : new Date()
  );
  const [assignmentEndDate, setAssignmentEndDate] = useState<Date | undefined>(
    endDate ? new Date(endDate) : addDays(new Date(), 1)
  );
  
  // Fetch driver assignments for this trip
  const { data: assignments, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ["/api/trips", tripId, "driver-assignments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/trips/${tripId}/driver-assignments`);
      const data = await res.json();
      return data as DriverAssignment[];
    },
    enabled: !!tripId,
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

  // Create driver assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/driver-assignments`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Created",
        description: "The driver has been successfully assigned to this schedule.",
      });
      setIsDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "driver-assignments"] });
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
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/trips/${tripId}/driver-assignments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Updated",
        description: "The driver assignment has been successfully updated.",
      });
      setIsDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "driver-assignments"] });
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
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/trips/${tripId}/driver-assignments/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Driver Assignment Removed",
        description: "The driver assignment has been successfully removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "driver-assignments"] });
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
    setAssignmentNotes("");
    setIsRecurring(false);
    setRecurrencePattern("daily");
    setRecurrenceDays([]);
    setSelectedAssignment(null);
    setAssignmentStartDate(startDate ? new Date(startDate) : new Date());
    setAssignmentEndDate(endDate ? new Date(endDate) : addDays(new Date(), 1));
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
      updateAssignmentMutation.mutate({ id: selectedAssignment.id, data });
    } else {
      createAssignmentMutation.mutate(data);
    }
  }

  function handleEditAssignment(assignment: DriverAssignment) {
    setSelectedAssignment(assignment);
    setSelectedDriverId(assignment.driverId.toString());
    setSelectedVehicleId(assignment.vehicleId?.toString() || "");
    setAssignmentNotes(assignment.notes || "");
    setIsRecurring(assignment.isRecurring);
    setRecurrencePattern(assignment.recurrencePattern || "daily");
    setRecurrenceDays(assignment.recurrenceDays ? JSON.parse(assignment.recurrenceDays) : []);
    setAssignmentStartDate(new Date(assignment.startDate));
    setAssignmentEndDate(new Date(assignment.endDate));
    setIsDriverDialogOpen(true);
  }

  function handleDeleteAssignment(id: number) {
    if (confirm("Are you sure you want to remove this driver assignment?")) {
      deleteAssignmentMutation.mutate(id);
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

  // Filter assignments for the selected date
  const assignmentsForSelectedDate = assignments?.filter(assignment => {
    if (!selectedDate) return false;
    
    const start = new Date(assignment.startDate);
    const end = new Date(assignment.endDate);
    
    // Check if selected date is between start and end dates
    if (selectedDate >= start && selectedDate <= end) {
      // For non-recurring assignments, return true
      if (!assignment.isRecurring) {
        return true;
      }
      
      // For recurring assignments, check the pattern
      const dayOfWeek = format(selectedDate, "EEE").toLowerCase();
      
      switch (assignment.recurrencePattern) {
        case "daily":
          return true;
        case "weekdays":
          return ["mon", "tue", "wed", "thu", "fri"].includes(dayOfWeek);
        case "weekends":
          return ["sat", "sun"].includes(dayOfWeek);
        case "specific-days":
          if (assignment.recurrenceDays) {
            const days = JSON.parse(assignment.recurrenceDays);
            return days.includes(dayOfWeek);
          }
          return false;
        default:
          return false;
      }
    }
    
    return false;
  });

  if (isLoadingAssignments || isLoadingDrivers || isLoadingVehicles) {
    return <LoadingFallback />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/2 flex flex-col space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Driver/Runner Assignments</CardTitle>
              <CardDescription>
                Manage driver and runner assignments for this schedule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-base font-semibold">Schedule</Label>
                <p className="text-sm text-muted-foreground">{tripName}</p>
              </div>
            
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-base font-semibold">Select Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 px-3">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="border rounded-md p-4">
                  {selectedDate && (
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">
                        Assignments for {format(selectedDate, "PPP")}
                      </h3>
                      
                      <Button 
                        onClick={() => {
                          setSelectedAssignment(null);
                          resetForm();
                          setIsDriverDialogOpen(true);
                        }}
                      >
                        Add Driver
                      </Button>
                    </div>
                  )}
                  
                  {assignmentsForSelectedDate && assignmentsForSelectedDate.length > 0 ? (
                    <div className="space-y-3">
                      {assignmentsForSelectedDate.map((assignment) => {
                        const driver = eligibleDrivers?.find(d => d.id === assignment.driverId);
                        const vehicle = vehicles?.find(v => v.id === assignment.vehicleId);
                        
                        return (
                          <Card key={assignment.id} className="border border-muted">
                            <CardHeader className="pb-2">
                              <div className="flex justify-between">
                                <CardTitle className="text-base">
                                  {driver?.displayName || `Driver #${assignment.driverId}`}
                                </CardTitle>
                                <div className="text-sm text-muted-foreground">
                                  {assignment.status === "scheduled" ? (
                                    <span className="text-blue-500">Scheduled</span>
                                  ) : assignment.status === "completed" ? (
                                    <span className="text-green-500">Completed</span>
                                  ) : (
                                    <span className="text-red-500">Cancelled</span>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="py-1">
                              {vehicle && (
                                <div className="flex items-center text-sm text-muted-foreground mb-2">
                                  <Car className="h-4 w-4 mr-1" />
                                  {vehicle.make} {vehicle.model} {vehicle.year} {vehicle.color && `(${vehicle.color})`}
                                </div>
                              )}
                              
                              {assignment.isRecurring && (
                                <div className="flex items-center text-sm text-muted-foreground mb-2">
                                  <Calendar className="h-4 w-4 mr-1" />
                                  {assignment.recurrencePattern === "daily" && "Recurring daily"}
                                  {assignment.recurrencePattern === "weekdays" && "Recurring on weekdays"}
                                  {assignment.recurrencePattern === "weekends" && "Recurring on weekends"}
                                  {assignment.recurrencePattern === "specific-days" && 
                                    `Recurring on ${JSON.parse(assignment.recurrenceDays || "[]")
                                      .map((day: string) => day.charAt(0).toUpperCase() + day.slice(1))
                                      .join(", ")}`
                                  }
                                </div>
                              )}
                              
                              {assignment.notes && (
                                <div className="text-sm mt-2">{assignment.notes}</div>
                              )}
                            </CardContent>
                            <CardFooter className="pt-1 flex justify-end gap-2">
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleEditAssignment(assignment)}
                              >
                                Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleDeleteAssignment(assignment.id)}
                              >
                                Remove
                              </Button>
                            </CardFooter>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No drivers assigned</h3>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">
                        No driver assignments for this date. Add a driver to get started.
                      </p>
                      <Button 
                        onClick={() => {
                          setSelectedAssignment(null);
                          resetForm();
                          setIsDriverDialogOpen(true);
                        }}
                      >
                        Add Driver
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="md:w-1/2">
          <Card>
            <CardHeader>
              <CardTitle>Eligible Drivers</CardTitle>
              <CardDescription>
                List of eligible drivers in your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eligibleDrivers && eligibleDrivers.length > 0 ? (
                <div className="space-y-3">
                  {eligibleDrivers
                    .filter(driver => driver.isEligibleDriver)
                    .map(driver => (
                      <Card key={driver.id} className="border border-muted">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{driver.displayName}</CardTitle>
                          <CardDescription>{driver.username}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0 flex justify-end">
                          <Button 
                            size="sm"
                            onClick={() => {
                              setSelectedAssignment(null);
                              resetForm();
                              setSelectedDriverId(driver.id.toString());
                              setIsDriverDialogOpen(true);
                            }}
                          >
                            Assign to Schedule
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <User className="h-10 w-10 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No eligible drivers</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    There are no eligible drivers in your organization. Users can be marked as eligible drivers in their profiles.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Driver Assignment Dialog */}
      <Dialog open={isDriverDialogOpen} onOpenChange={setIsDriverDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedAssignment ? "Edit Driver Assignment" : "Assign Driver"}
            </DialogTitle>
            <DialogDescription>
              {selectedAssignment 
                ? "Update the driver assignment details"
                : "Assign a driver to this schedule and set their schedule"
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="driver">Select Driver</Label>
              <Select 
                value={selectedDriverId} 
                onValueChange={setSelectedDriverId}
              >
                <SelectTrigger id="driver">
                  <SelectValue placeholder="Select a driver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Eligible Drivers</SelectLabel>
                    {eligibleDrivers
                      ?.filter(driver => driver.isEligibleDriver)
                      .map(driver => (
                        <SelectItem key={driver.id} value={driver.id.toString()}>
                          {driver.displayName}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="vehicle">Select Vehicle (Optional)</Label>
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
                      id="startDate"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
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
                      id="endDate"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
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
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="isRecurring" 
                  checked={isRecurring}
                  onCheckedChange={(checked) => setIsRecurring(!!checked)}
                />
                <Label htmlFor="isRecurring">Recurring Assignment</Label>
              </div>
            </div>
            
            {isRecurring && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recurrencePattern">Recurrence Pattern</Label>
                  <Select 
                    value={recurrencePattern} 
                    onValueChange={setRecurrencePattern}
                  >
                    <SelectTrigger id="recurrencePattern">
                      <SelectValue placeholder="Select pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
                      <SelectItem value="weekends">Weekends (Sat-Sun)</SelectItem>
                      <SelectItem value="specific-days">Specific Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {recurrencePattern === "specific-days" && (
                  <div className="space-y-2">
                    <Label>Select Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {days.map(day => (
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
                placeholder="Add notes about this assignment"
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDriverDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAssignment}
              disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
            >
              {(createAssignmentMutation.isPending || updateAssignmentMutation.isPending) && (
                <div className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedAssignment ? "Update Assignment" : "Create Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}