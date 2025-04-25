import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Vehicle, InsertVehicle } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Extend the vehicle schema with validation
const vehicleFormSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.string().refine(val => !val || !isNaN(Number(val)), {
    message: "Year must be a valid number"
  }).transform(val => val ? parseInt(val) : null).optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  capacity: z.string().refine(val => !val || !isNaN(Number(val)), {
    message: "Capacity must be a valid number"
  }).transform(val => val ? parseInt(val) : 5).optional(),
  notes: z.string().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface VehicleFormProps {
  vehicle?: Vehicle;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function VehicleForm({ vehicle, onSuccess, onCancel }: VehicleFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Initialize form with default values or existing vehicle data
  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      make: vehicle?.make || "",
      model: vehicle?.model || "",
      year: vehicle?.year ? String(vehicle.year) : "",
      licensePlate: vehicle?.licensePlate || "",
      color: vehicle?.color || "",
      capacity: vehicle?.capacity ? String(vehicle.capacity) : "5",
      notes: vehicle?.notes || "",
    },
  });

  // Create or update mutation
  const mutation = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      // Convert values to match the expected API format
      const vehicleData: Partial<InsertVehicle> = {
        make: values.make,
        model: values.model,
        year: values.year || undefined,
        licensePlate: values.licensePlate || undefined,
        color: values.color || undefined,
        capacity: values.capacity || 5,
        notes: values.notes || undefined,
      };

      if (vehicle) {
        // Update existing vehicle
        const res = await apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, vehicleData);
        return await res.json();
      } else {
        // Create new vehicle
        const res = await apiRequest("POST", "/api/vehicles", vehicleData);
        return await res.json();
      }
    },
    onSuccess: () => {
      // Invalidate the vehicles query to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      
      toast({
        title: vehicle ? "Vehicle updated" : "Vehicle added",
        description: vehicle 
          ? "Your vehicle information has been updated successfully." 
          : "Your vehicle has been added successfully.",
      });
      
      // Call the success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  function onSubmit(values: VehicleFormValues) {
    mutation.mutate(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="make"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Make*</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Toyota" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model*</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Camry" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 2023" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Silver" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Passenger Capacity</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 5" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="licensePlate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>License Plate</FormLabel>
              <FormControl>
                <Input placeholder="e.g., ABC-123" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Any additional information about this vehicle" 
                  {...field} 
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2">
          {onCancel && (
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button 
            type="submit" 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : (vehicle ? "Update Vehicle" : "Add Vehicle")}
          </Button>
        </div>
      </form>
    </Form>
  );
}