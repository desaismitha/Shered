import React, { useState, useEffect } from "react";
import { User, TripVehicle, Vehicle } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Car, User as UserIcon, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

interface TripDriverAssignmentProps {
  tripId: number;
  accessLevel: 'owner' | 'member';
}

export function TripDriverAssignment({ tripId, accessLevel }: TripDriverAssignmentProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  
  // Get trip vehicle assignments
  const { data: tripVehicles, isLoading: isLoadingVehicles } = useQuery<TripVehicle[]>({
    queryKey: ["/api/trips", tripId, "vehicles"],
    enabled: !!tripId,
  });

  // Get vehicle details
  const { data: vehicles, isLoading: isLoadingVehicleDetails } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    enabled: !!tripVehicles && tripVehicles.length > 0,
  });
  
  // Get all users who are group members with driver eligibility
  const { data: eligibleDrivers, isLoading: isLoadingDrivers } = useQuery<User[]>({
    queryKey: ["/api/trips", tripId, "eligible-drivers"],
    enabled: !!tripId,
  });
  
  // Set the first vehicle as selected by default when data loads
  useEffect(() => {
    if (tripVehicles && tripVehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(tripVehicles[0].vehicleId);
    }
  }, [tripVehicles, selectedVehicleId]);
  
  // Assign driver mutation
  const assignDriverMutation = useMutation({
    mutationFn: async ({ vehicleId, driverId }: { vehicleId: number, driverId: number | null }) => {
      const res = await apiRequest(
        "PUT", 
        `/api/trips/${tripId}/vehicles/${vehicleId}/assign-driver`, 
        { driverId }
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "vehicles"] });
      
      toast({
        title: "Driver assigned",
        description: "The driver has been assigned to the vehicle successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error assigning driver",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle driver assignment
  const handleAssignDriver = (driverId: string, vehicleId: number) => {
    assignDriverMutation.mutate({ 
      vehicleId, 
      driverId: driverId === "none" ? null : parseInt(driverId) 
    });
  };
  
  // Get current selected vehicle
  const selectedVehicle = tripVehicles?.find(tv => tv.vehicleId === selectedVehicleId);
  const vehicleDetails = selectedVehicle ? vehicles?.find(v => v.id === selectedVehicle.vehicleId) : null;
  
  // Is user allowed to make changes
  const canEdit = accessLevel === 'owner';
  
  if (isLoadingVehicles || isLoadingVehicleDetails || isLoadingDrivers) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2">Loading driver information...</span>
      </div>
    );
  }
  
  if (!tripVehicles || tripVehicles.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No vehicles assigned</AlertTitle>
        <AlertDescription>
          No vehicles have been assigned to this trip yet. Please add vehicles from the Vehicles tab first.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (!eligibleDrivers || eligibleDrivers.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No eligible drivers</AlertTitle>
        <AlertDescription>
          There are no eligible drivers for this trip. Members must update their driver license information 
          and mark themselves as eligible drivers.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Vehicle selector */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <Label htmlFor="vehicle-select">Select Vehicle</Label>
          <Select
            value={selectedVehicleId?.toString()}
            onValueChange={(value) => setSelectedVehicleId(parseInt(value))}
          >
            <SelectTrigger id="vehicle-select" className="w-full mt-1">
              <SelectValue placeholder="Choose a vehicle" />
            </SelectTrigger>
            <SelectContent>
              {tripVehicles.map((tv) => {
                const vehicle = vehicles?.find(v => v.id === tv.vehicleId);
                if (!vehicle) return null;
                
                return (
                  <SelectItem key={tv.vehicleId} value={tv.vehicleId.toString()}>
                    {vehicle.make} {vehicle.model} {vehicle.year}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <Separator />
      
      {/* Selected vehicle details */}
      {selectedVehicle && vehicleDetails && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <Car className="h-5 w-5 mr-2 text-primary" />
              {vehicleDetails.make} {vehicleDetails.model} {vehicleDetails.year}
            </CardTitle>
            <CardDescription>
              {vehicleDetails.color} • {vehicleDetails.licensePlate || "No license plate"} • Seats {vehicleDetails.capacity || "unknown"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current driver */}
              <div>
                <Label>Assigned Driver</Label>
                <div className="mt-2">
                  {selectedVehicle.assignedTo ? (
                    <div className="flex items-center">
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                        <UserIcon className="h-3.5 w-3.5 mr-1" />
                        {eligibleDrivers.find(d => d.id === selectedVehicle.assignedTo)?.displayName || "Unknown driver"}
                      </Badge>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      No driver assigned
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Driver assignment controls */}
              {canEdit && (
                <div className="pt-2">
                  <Label htmlFor="driver-select">Assign Driver</Label>
                  <div className="flex gap-2 mt-1">
                    <Select
                      onValueChange={(value) => handleAssignDriver(value, selectedVehicle.vehicleId)}
                      defaultValue={selectedVehicle.assignedTo?.toString() || "none"}
                    >
                      <SelectTrigger id="driver-select" className="w-full">
                        <SelectValue placeholder="Choose a driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Remove assignment)</SelectItem>
                        {eligibleDrivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id.toString()}>
                            {driver.displayName || driver.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Eligible drivers list */}
      <div className="mt-6">
        <h3 className="text-lg font-medium mb-3">Eligible Drivers</h3>
        <div className="space-y-3">
          {eligibleDrivers.map(driver => {
            const isAssigned = tripVehicles.some(tv => tv.assignedTo === driver.id);
            const assignedVehicle = isAssigned 
              ? vehicles?.find(v => v.id === tripVehicles.find(tv => tv.assignedTo === driver.id)?.vehicleId)
              : null;
              
            return (
              <div key={driver.id} className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <p className="font-medium">{driver.displayName || driver.username}</p>
                  <p className="text-sm text-muted-foreground">
                    License: {driver.licenseNumber} ({driver.licenseState}) - 
                    Expires: {format(new Date(driver.licenseExpiry!), "MM/dd/yyyy")}
                  </p>
                </div>
                
                {isAssigned && assignedVehicle ? (
                  <Badge className="bg-primary/10 text-primary">
                    Driving: {assignedVehicle.make} {assignedVehicle.model}
                  </Badge>
                ) : (
                  <Badge variant="outline">Available</Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}