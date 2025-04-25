import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Vehicle } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Car, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VehicleForm } from "./vehicle-form";

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/vehicles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      toast({
        title: "Vehicle deleted",
        description: "Your vehicle has been deleted successfully.",
      });
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              {vehicle.make} {vehicle.model}
            </CardTitle>
            {vehicle.year && (
              <CardDescription>{vehicle.year}</CardDescription>
            )}
          </div>
          <div className="flex gap-1">
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Edit className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Edit Vehicle</DialogTitle>
                </DialogHeader>
                <VehicleForm 
                  vehicle={vehicle} 
                  onSuccess={() => setShowEditDialog(false)} 
                />
              </DialogContent>
            </Dialog>
            
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Confirm Deletion</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p>Are you sure you want to delete this vehicle? This action cannot be undone.</p>
                  <p className="mt-2 font-semibold">{vehicle.make} {vehicle.model} {vehicle.year || ""}</p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => deleteMutation.mutate(vehicle.id)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {vehicle.color && (
            <div>
              <span className="font-medium">Color: </span>
              <span>{vehicle.color}</span>
            </div>
          )}
          {vehicle.licensePlate && (
            <div>
              <span className="font-medium">License: </span>
              <span>{vehicle.licensePlate}</span>
            </div>
          )}
          {vehicle.capacity && (
            <div>
              <span className="font-medium">Capacity: </span>
              <span>{vehicle.capacity} passengers</span>
            </div>
          )}
        </div>
        {vehicle.notes && (
          <div className="mt-3 border-t pt-2 text-sm">
            <p className="text-muted-foreground">{vehicle.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}