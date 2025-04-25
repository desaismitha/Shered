import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trip as BaseTrip, insertTripSchema, InsertTrip } from "@shared/schema";

// Extend the Trip interface to include access level information
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member';
}
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/components/layout/app-shell";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Extend the schema for update form
const tripUpdateSchema = insertTripSchema
  .extend({
    id: z.number(),
    startDate: z.coerce.date({
      required_error: "Start date is required",
    }),
    endDate: z.coerce.date({
      required_error: "End date is required",
    }),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

// Type for form values
type TripUpdateValues = z.infer<typeof tripUpdateSchema>;

export default function EditTripPage() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Fetch trip data
  const { data: trip, isLoading: isLoadingTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
  });
  
  // Fetch user's groups for the dropdown
  const { data: groups = [], isLoading: isLoadingGroups } = useQuery<any[]>({
    queryKey: ["/api/groups"],
  });
  
  // Set up the form
  const form = useForm<TripUpdateValues>({
    resolver: zodResolver(tripUpdateSchema),
    defaultValues: {
      id: tripId,
      name: "",
      destination: "",
      startDate: new Date(),
      endDate: new Date(),
      description: "",
      imageUrl: "",
      status: "planning",
      groupId: undefined,
    },
  });
  
  // Update form with trip data when it's loaded
  useEffect(() => {
    if (trip) {
      form.reset({
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        startDate: new Date(trip.startDate),
        endDate: new Date(trip.endDate),
        description: trip.description || "",
        imageUrl: trip.imageUrl || "",
        status: trip.status || "planning",
        groupId: trip.groupId,
      });
    }
  }, [trip, form]);
  
  // Update trip mutation
  const updateMutation = useMutation({
    mutationFn: async (values: TripUpdateValues) => {
      const res = await apiRequest("PUT", `/api/trips/${tripId}`, values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trip updated",
        description: "Your trip has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      navigate(`/trips/${tripId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating trip",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle form submission
  const onSubmit = (values: TripUpdateValues) => {
    if (!trip || !hasEditPermission) {
      toast({
        title: "Permission error",
        description: "You don't have permission to edit this trip",
        variant: "destructive",
      });
      return;
    }
    
    // Make sure we use the original creator ID, not the current user ID
    const updateData = {
      ...values,
      createdBy: trip.createdBy, // IMPORTANT: Keep the original creator
    };
    
    console.log("EDIT TRIP - Form values:", values);
    console.log("EDIT TRIP - Trip data:", trip);
    console.log("EDIT TRIP - Access level:", trip._accessLevel);
    console.log("EDIT TRIP - Has edit permission:", hasEditPermission);
    console.log("EDIT TRIP - Data to be sent:", updateData);
    
    updateMutation.mutate(updateData);
  };
  
  // Check if user is allowed to edit this trip using the access level from the API
  // The API now returns _accessLevel field: 'owner', 'member', or undefined
  const hasEditPermission = trip?._accessLevel === 'owner';
  
  // Debug access level information
  useEffect(() => {
    if (trip) {
      console.log("EDIT TRIP PAGE - Access level check:", { 
        accessLevel: trip._accessLevel,
        hasEditPermission,
        tripData: trip
      });
    }
  }, [trip, hasEditPermission]);
  
  useEffect(() => {
    // Redirect if not the owner
    if (trip && !hasEditPermission) {
      toast({
        title: "Access denied",
        description: "You can only edit trips you created",
        variant: "destructive",
      });
      navigate(`/trips/${tripId}`);
    }
  }, [trip, hasEditPermission, navigate, toast, tripId]);
  
  return (
    <AppShell>
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate(`/trips/${tripId}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trip Details
          </Button>
          <h1 className="text-2xl font-bold">Edit Trip</h1>
        </div>
        
        {isLoadingTrip ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-1/4" />
          </div>
        ) : !trip ? (
          <div className="bg-destructive/10 p-4 rounded-md">
            <p className="text-destructive">Trip not found or you don't have permission to edit it.</p>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trip Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter trip name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter destination" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your trip" 
                          className="min-h-[120px]" 
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image URL (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter an image URL" 
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value || 'planning'}
                        value={field.value || 'planning'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="upcoming">Upcoming</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        defaultValue={field.value?.toString()}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingGroups ? (
                            <SelectItem value="loading" disabled>
                              Loading groups...
                            </SelectItem>
                          ) : groups && groups.length > 0 ? (
                            groups.map((group) => (
                              <SelectItem key={group.id} value={group.id.toString()}>
                                {group.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              No groups available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end space-x-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => navigate(`/trips/${tripId}`)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}
      </div>
    </AppShell>
  );
}