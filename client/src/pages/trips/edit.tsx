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
import MapLocationPicker from "@/components/maps/map-location-picker";
import RouteMapPreview from "@/components/maps/route-map-preview";
import { Skeleton } from "@/components/ui/skeleton";

import { compareDates } from "@/lib/utils";

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
  // Ensure dates are valid
  .refine((data) => {
    // First validate that dates are not in the past
    const now = new Date();
    // Add 5 minutes buffer for form submission
    const validTime = new Date(now.getTime() + 5 * 60 * 1000);
    return data.startDate >= validTime;
  }, {
    message: "Start date must be at least 5 minutes in the future",
    path: ["startDate"],
  })
  .refine((data) => {
    // Validate end date is not in the past
    const now = new Date();
    // Add 5 minutes buffer for form submission
    const validTime = new Date(now.getTime() + 5 * 60 * 1000);
    return data.endDate >= validTime;
  }, {
    message: "End date must be at least 5 minutes in the future",
    path: ["endDate"],
  })
  .refine((data) => {
    // Use our new compareDates function that handles local timezone correctly
    const comparison = compareDates(data.startDate, data.endDate);
    // Allow same day or end date after start date
    return comparison === 'same' || comparison === 'before';
  }, {
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
  
  // State to manage location inputs 
  const [startLocation, setStartLocation] = useState<string>("");
    
  // Set up the form
  const form = useForm<TripUpdateValues>({
    resolver: zodResolver(tripUpdateSchema),
    defaultValues: {
      id: tripId,
      name: "",
      startLocation: "",
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
      // Set the startLocation state for the RouteMapPreview
      setStartLocation(trip.startLocation || "");
      
      // Make sure to properly normalize dates to prevent timezone issues
      const normalizedStartDate = trip.startDate ? new Date(trip.startDate) : new Date();
      const normalizedEndDate = trip.endDate ? new Date(trip.endDate) : new Date();
      
      console.log("Normalizing dates:", {
        originalStart: trip.startDate,
        originalEnd: trip.endDate,
        normalizedStart: normalizedStartDate,
        normalizedEnd: normalizedEndDate
      });
      
      form.reset({
        id: trip.id,
        name: trip.name,
        startLocation: trip.startLocation || "",
        destination: trip.destination || "",
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        description: trip.description || "",
        imageUrl: trip.imageUrl || "",
        status: trip.status || "planning",
        groupId: trip.groupId,
      });
    }
  }, [trip, form]);
  
  // Update trip mutation with a much simpler implementation
  const updateMutation = useMutation<Trip, Error, any>({
    mutationFn: async (values: any) => {
      // Step 1: Log what we're sending
      console.log(`MUTATION - Preparing to update trip ${tripId}`);
      console.log("MUTATION - Raw values:", values);
      
      // Step 2: Simplify the payload and properly normalize dates
      const startDate = values.startDate instanceof Date 
        ? values.startDate 
        : new Date(values.startDate);
      
      const endDate = values.endDate instanceof Date 
        ? values.endDate 
        : new Date(values.endDate);
        
      console.log("Date values before conversion:", {
        rawStartDate: values.startDate,
        rawEndDate: values.endDate,
        processedStartDate: startDate,
        processedEndDate: endDate
      });
      
      const payload = {
        name: values.name,
        startLocation: values.startLocation,
        destination: values.destination,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: values.status,
        groupId: values.groupId,
        description: values.description || "",
        imageUrl: values.imageUrl || "",
      };
      
      // Log the clean payload
      console.log("MUTATION - Sending payload:", payload);
      
      // Step 3: Make the request with simplified error handling
      try {
        // Make request with a simple payload
        const response = await fetch(`/api/trips/${tripId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          credentials: 'include',
        });
        
        // Log the response status
        console.log(`MUTATION - Response status: ${response.status}`);
        
        // Try to get the response text regardless of success/failure
        const text = await response.text();
        console.log("MUTATION - Response text:", text);
        
        // Check if response was successful
        if (!response.ok) {
          throw new Error(`Server error (${response.status}): ${text}`);
        }
        
        // Parse the response text as JSON
        return JSON.parse(text);
      } catch (error) {
        console.error("MUTATION - Request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("MUTATION - Success! Updated trip:", data);
      toast({
        title: "Trip updated",
        description: "Your trip has been updated successfully",
      });
      // Invalidate all trip-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      // Navigate back to trip details page
      navigate(`/trips/${tripId}`);
    },
    onError: (error: Error) => {
      console.error("MUTATION - Error updating trip:", error);
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
    
    try {
      console.log("EDIT TRIP - Original form values:", values);
      
      // Ensure dates are proper Date objects (they might be sometimes serialized as strings)
      if (!(values.startDate instanceof Date)) {
        values.startDate = new Date(values.startDate);
      }
      
      if (!(values.endDate instanceof Date)) {
        values.endDate = new Date(values.endDate);
      }
      
      // Extra date validation before submission (in addition to schema validation)
      // This catches any last minute changes or validation issues
      const now = new Date();
      const validationTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute buffer
      
      // Check start date is in the future
      if (values.startDate < validationTime) {
        toast({
          title: "Invalid start date",
          description: "Start date must be at least 5 minutes in the future",
          variant: "destructive",
        });
        return;
      }
      
      // Check end date is in the future
      if (values.endDate < validationTime) {
        toast({
          title: "Invalid end date",
          description: "End date must be at least 5 minutes in the future",
          variant: "destructive",
        });
        return;
      }
      
      // ALWAYS check and enforce that end date is after start date
      // This is our final validation gate to ensure data integrity
      if (values.endDate <= values.startDate) {
        // Force end date to be 30 minutes after start date with precise calculation
        const adjustedEndDate = new Date(values.startDate.getTime() + 30 * 60 * 1000);
        
        console.log("FINAL VALIDATION - auto-adjusting end date in edit form:", {
          originalStartDate: values.startDate.toISOString(),
          originalEndDate: values.endDate.toISOString(),
          adjustedEndDate: adjustedEndDate.toISOString()
        });
        
        // Update the form values
        form.setValue('endDate', adjustedEndDate);
        
        // Update the values object that will be submitted
        values.endDate = adjustedEndDate;
        
        // Show toast notification about the adjustment
        toast({
          title: "End time adjusted",
          description: "End time cannot be before or equal to start time. Adjusted to be 30 minutes after start time.",
          duration: 5000
        });
      }
      
      // Extra logging to confirm final values being submitted
      console.log("FINAL EDIT SUBMISSION VALUES:", {
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
        timeDiff: (values.endDate.getTime() - values.startDate.getTime()) / 60000 + " minutes"
      });
      
      // Create a stripped-down version with only the fields we want to update
      const updateData = {
        name: values.name,
        startLocation: values.startLocation,
        destination: values.destination,
        startDate: values.startDate,
        endDate: values.endDate,
        description: values.description || "", 
        imageUrl: values.imageUrl || "",
        status: values.status,
        groupId: values.groupId,
      };
      
      console.log("EDIT TRIP - Form values after processing:", updateData);
      console.log("EDIT TRIP - Trip data:", trip);
      console.log("EDIT TRIP - Access level:", trip._accessLevel);
      console.log("EDIT TRIP - Has edit permission:", hasEditPermission);
      
      // Debug URL and request format
      console.log(`EDIT TRIP - API Call: PUT /api/trips/${tripId}`);
      
      // Execute the update
      updateMutation.mutate(updateData);
    } catch (error) {
      console.error("Error in trip edit submit handler:", error);
      toast({
        title: "Form submission error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };
  
  // Check if user is allowed to edit this trip using the access level from the API
  // The API now returns _accessLevel field: 'owner', 'member', or undefined
  const hasEditPermission = trip?._accessLevel === 'owner' || user?.id === trip?.createdBy;
  
  // Debug access level information
  useEffect(() => {
    if (trip) {
      console.log("EDIT TRIP PAGE - Access level check:", { 
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
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="startLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Location</FormLabel>
                          <FormControl>
                            <MapLocationPicker
                              label=""
                              value={field.value || ""}
                              onChange={(val) => {
                                field.onChange(val);
                                setStartLocation(val);
                              }}
                              placeholder="Enter start location"
                              required
                            />
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
                            <MapLocationPicker
                              label=""
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="Enter destination"
                              required
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Add Route Map Preview - only when we have both locations */}
                  {form.watch('startLocation') && form.watch('destination') && (
                    <div className="border rounded-md p-4 bg-gray-50">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-medium">Route Map Preview</h3>
                      </div>
                      <RouteMapPreview 
                        startLocation={form.watch('startLocation') as string}
                        endLocation={form.watch('destination') as string}
                        showMap={true}
                        onToggleMap={() => {}} // Always showing the map
                      />
                    </div>
                  )}
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