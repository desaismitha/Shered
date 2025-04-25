import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Vehicle } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Form schema for vehicle creation/editing
const vehicleFormSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().positive().int().nullable().optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  capacity: z.coerce.number().positive().int().optional(),
  notes: z.string().optional(),
});

interface VehicleFormProps {
  vehicle?: Vehicle;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function VehicleForm({ vehicle, onSuccess, onCancel }: VehicleFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = !!vehicle;

  // Initialize the form with default values or current vehicle data
  const form = useForm({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      make: vehicle?.make || "",
      model: vehicle?.model || "",
      year: vehicle?.year ? String(vehicle.year) : "",
      licensePlate: vehicle?.licensePlate || "",
      color: vehicle?.color || "",
      capacity: vehicle?.capacity ? String(vehicle.capacity) : "",
      notes: vehicle?.notes || "",
    },
  });

  // Create mutation for adding a vehicle
  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof vehicleFormSchema>) => {
      // Convert empty strings to undefined
      const data = {
        ...values,
        licensePlate: values.licensePlate || undefined,
        color: values.color || undefined, 
        notes: values.notes || undefined,
        // Convert string number to actual number or undefined
        year: values.year ? Number(values.year) : undefined,
        capacity: values.capacity ? Number(values.capacity) : undefined,
      };
      
      const res = await apiRequest("POST", "/api/vehicles", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      toast({
        title: "Vehicle added",
        description: "Your vehicle has been added successfully!",
      });
      form.reset();
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

  // Update mutation for editing a vehicle
  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof vehicleFormSchema>) => {
      if (!vehicle) return null;
      
      // Convert empty strings to undefined
      const data = {
        ...values,
        licensePlate: values.licensePlate || undefined,
        color: values.color || undefined, 
        notes: values.notes || undefined,
        // Convert string number to actual number or undefined
        year: values.year ? Number(values.year) : undefined,
        capacity: values.capacity ? Number(values.capacity) : undefined,
      };
      
      const res = await apiRequest("PUT", `/api/vehicles/${vehicle.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      toast({
        title: "Vehicle updated",
        description: "Your vehicle has been updated successfully!",
      });
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
  function onSubmit(values: z.infer<typeof vehicleFormSchema>) {
    if (isEditing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
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
                  <Input placeholder="Toyota, Honda, etc." {...field} />
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
                  <Input placeholder="Camry, Civic, etc." {...field} />
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
                  <Input 
                    type="number" 
                    placeholder="2023" 
                    {...field} 
                    value={field.value || ''}
                    onChange={(e) => {
                      // Allow empty string
                      const value = e.target.value === '' ? '' : e.target.value;
                      field.onChange(value);
                    }}
                  />
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
                  <Input placeholder="Blue, Red, etc." {...field} />
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
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="4" 
                    {...field} 
                    value={field.value || ''}
                    onChange={(e) => {
                      // Allow empty string
                      const value = e.target.value === '' ? '' : e.target.value;
                      field.onChange(value);
                    }}
                  />
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
                <Input placeholder="ABC-123" {...field} />
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
                  placeholder="Any additional information about the vehicle" 
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
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isEditing 
              ? (updateMutation.isPending ? "Updating..." : "Update Vehicle")
              : (createMutation.isPending ? "Adding..." : "Add Vehicle")
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}