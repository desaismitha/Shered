import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Vehicle } from "@shared/schema";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { AppShell } from "@/components/layout/app-shell";

export default function VehiclesPage() {
  const { user } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Fetch user's vehicles
  const { 
    data: vehicles = [], 
    isLoading, 
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles');
      if (!response.ok) {
        throw new Error('Failed to fetch vehicles');
      }
      return response.json() as Promise<Vehicle[]>;
    }
  });

  // Loading skeleton UI
  if (isLoading) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">My Vehicles</h1>
            <Skeleton className="h-10 w-[140px]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // Error state
  if (error) {
    return (
      <AppShell>
        <div className="container py-6">
          <div className="text-center my-10">
            <p className="text-destructive text-lg">Failed to load vehicles</p>
            <Button 
              variant="outline" 
              onClick={() => refetch()} 
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Vehicles</h1>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add New Vehicle</DialogTitle>
              </DialogHeader>
              <VehicleForm onSuccess={() => setShowAddDialog(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {vehicles.length === 0 ? (
          <div className="bg-muted/30 rounded-lg p-10 text-center">
            <h3 className="text-xl font-medium mb-2">No vehicles yet</h3>
            <p className="text-muted-foreground mb-6">
              Add your vehicles to easily assign them to your trips.
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Vehicle
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map(vehicle => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}