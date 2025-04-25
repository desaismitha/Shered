import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { User, Vehicle, TripVehicle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Car, UserRound, Plus, Star, Trash2 } from "lucide-react";
import { TripVehicleForm } from "./trip-vehicle-form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TripVehicleListProps {
  tripId: number;
  accessLevel: 'owner' | 'member';
}

export function TripVehicleList({ tripId, accessLevel }: TripVehicleListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = React.useState(false);

  // Fetch trip vehicles
  const { 
    data: tripVehicles = [], 
    isLoading: isLoadingVehicles,
    error: vehiclesError
  } = useQuery({
    queryKey: [`/api/trips/${tripId}/vehicles`],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/trips/${tripId}/vehicles`);
        if (!response.ok) {
          throw new Error('Failed to fetch trip vehicles');
        }
        return response.json() as Promise<TripVehicle[]>;
      } catch (error) {
        console.error("Error fetching trip vehicles:", error);
        return [];
      }
    }
  });

  // Fetch vehicle details for each trip vehicle
  const { 
    data: vehicles = [], 
    isLoading: isLoadingVehicleDetails 
  } = useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/vehicles');
        if (!response.ok) {
          throw new Error('Failed to fetch vehicles');
        }
        return response.json() as Promise<Vehicle[]>;
      } catch (error) {
        console.error("Error fetching vehicles:", error);
        return [];
      }
    },
    enabled: tripVehicles.length > 0
  });

  // Fetch users for assigned users
  const { 
    data: users = [],
    isLoading: isLoadingUsers 
  } = useQuery({
    queryKey: ['/api/users'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        return response.json() as Promise<User[]>;
      } catch (error) {
        console.error("Error fetching users:", error);
        return [];
      }
    },
    enabled: tripVehicles.some(tv => tv.assignedTo !== null)
  });

  // Delete trip vehicle mutation
  const deleteVehicleMutation = useMutation({
    mutationFn: async (tripVehicleId: number) => {
      await apiRequest("DELETE", `/api/trips/${tripId}/vehicles/${tripVehicleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/vehicles`] });
      toast({
        title: "Vehicle removed",
        description: "The vehicle has been removed from this trip.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Prepare data with resolved details
  const preparedVehicles = React.useMemo(() => {
    return tripVehicles.map(tripVehicle => {
      const vehicleDetails = vehicles.find(v => v.id === tripVehicle.vehicleId);
      const assignedUser = tripVehicle.assignedTo 
        ? users.find(u => u.id === tripVehicle.assignedTo) 
        : null;
      
      return {
        ...tripVehicle,
        vehicle: vehicleDetails,
        assignedUser
      };
    });
  }, [tripVehicles, vehicles, users]);

  // Loading state
  if (isLoadingVehicles) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Trip Vehicles</h3>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-[200px]" />
                <Skeleton className="h-4 w-[100px]" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[60px]" />
                </div>
                <Skeleton className="h-4 w-full mt-3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (vehiclesError) {
    return (
      <div className="text-center py-4 text-destructive">
        Failed to load trip vehicles.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Trip Vehicles</h3>
        
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> 
              Assign Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Vehicle to Trip</DialogTitle>
            </DialogHeader>
            <TripVehicleForm 
              tripId={tripId} 
              onSuccess={() => setShowAddDialog(false)} 
              onCancel={() => setShowAddDialog(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {preparedVehicles.length === 0 ? (
        <div className="text-center p-6 border rounded-lg bg-muted/10">
          <Car className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No vehicles have been assigned to this trip yet.</p>
          <Button 
            variant="outline"
            className="mt-4"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> 
            Assign Vehicle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {preparedVehicles.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2 flex-row justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    {item.vehicle?.make} {item.vehicle?.model}
                    {item.isMain && (
                      <Badge variant="outline" className="gap-1 ml-1">
                        <Star className="h-3 w-3 fill-current" /> Main
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {item.vehicle?.year} {item.vehicle?.color && `• ${item.vehicle.color}`}
                  </CardDescription>
                </div>
                
                {accessLevel === 'owner' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteVehicleMutation.mutate(item.id)}
                    disabled={deleteVehicleMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {item.assignedUser && (
                  <div className="text-sm flex items-center gap-1 mb-2">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">Assigned to:</span>
                    <span>{item.assignedUser.displayName || item.assignedUser.username}</span>
                  </div>
                )}
                
                {item.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}