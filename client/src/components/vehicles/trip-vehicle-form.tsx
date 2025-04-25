import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { User, Vehicle } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// Form schema for assigning a vehicle to a trip
const tripVehicleFormSchema = z.object({
  vehicleId: z.string().min(1, "Please select a vehicle"),
  isMain: z.boolean().default(true),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

type TripVehicleFormValues = z.infer<typeof tripVehicleFormSchema>;

interface TripVehicleFormProps {
  tripId: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TripVehicleForm({ tripId, onSuccess, onCancel }: TripVehicleFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch the user's vehicles
  const { data: vehicles = [], isLoading: isLoadingVehicles } = useQuery({
    queryKey: ['/api/vehicles'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles');
      if (!response.ok) {
        throw new Error('Failed to fetch vehicles');
      }
      return response.json() as Promise<Vehicle[]>;
    }
  });
  
  // Fetch group members for the trip (to assign vehicles to members)
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: [`/api/trips/${tripId}/members`],
    queryFn: async () => {
      try {
        // First get the trip to get the group ID
        const tripResponse = await fetch(`/api/trips/${tripId}`);
        if (!tripResponse.ok) {
          throw new Error('Failed to fetch trip details');
        }
        
        const trip = await tripResponse.json();
        
        if (!trip.groupId) {
          return [];
        }
        
        // Then get the group members
        const response = await fetch(`/api/groups/${trip.groupId}/members`);
        if (!response.ok) {
          throw new Error('Failed to fetch group members');
        }
        
        const members = await response.json();
        
        // Get member user details
        const usersResponse = await fetch('/api/users');
        if (!usersResponse.ok) {
          throw new Error('Failed to fetch users');
        }
        
        const users = await usersResponse.json() as User[];
        
        // Map user details to members
        return members.map((member: any) => {
          const user = users.find(u => u.id === member.userId);
          return {
            ...member,
            user
          };
        });
      } catch (error) {
        console.error("Error fetching members:", error);
        return [];
      }
    }
  });
  
  // Initialize form
  const form = useForm<TripVehicleFormValues>({
    resolver: zodResolver(tripVehicleFormSchema),
    defaultValues: {
      vehicleId: "",
      isMain: true,
      assignedTo: "",
      notes: "",
    },
  });

  // Assign vehicle mutation
  const mutation = useMutation({
    mutationFn: async (values: TripVehicleFormValues) => {
      const data = {
        vehicleId: parseInt(values.vehicleId),
        isMain: values.isMain,
        assignedTo: values.assignedTo && values.assignedTo !== "none" ? parseInt(values.assignedTo) : undefined,
        notes: values.notes || undefined,
      };
      
      const res = await apiRequest("POST", `/api/trips/${tripId}/vehicles`, data);
      return await res.json();
    },
    onSuccess: () => {
      // Invalidate the trip vehicles query to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/vehicles`] });
      
      toast({
        title: "Vehicle assigned",
        description: "The vehicle has been successfully assigned to this trip.",
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
  function onSubmit(values: TripVehicleFormValues) {
    mutation.mutate(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="vehicleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Select Vehicle*</FormLabel>
              <Select
                disabled={isLoadingVehicles}
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                      {vehicle.color && ` - ${vehicle.color}`}
                    </SelectItem>
                  ))}
                  {vehicles.length === 0 && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      No vehicles found. Add a vehicle first.
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="isMain"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Main vehicle for this trip</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Mark this as the primary vehicle for the trip
                </p>
              </div>
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="assignedTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assign To</FormLabel>
              <Select
                disabled={isLoadingMembers}
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to a group member (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {members.map((member: any) => (
                    <SelectItem key={member.userId} value={String(member.userId)}>
                      {member.user?.displayName || member.user?.username || `User ${member.userId}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  placeholder="Additional information about this vehicle's use in the trip" 
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
            disabled={mutation.isPending || vehicles.length === 0}
          >
            {mutation.isPending ? "Assigning..." : "Assign Vehicle"}
          </Button>
        </div>
      </form>
    </Form>
  );
}