import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTripSchema, InsertTrip } from "@shared/schema";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Group } from "@shared/schema";

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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, isEqual, isBefore } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn, compareDates } from "@/lib/utils";

// Function to create a date used for comparison in validation
function getValidationDate() {
  // Add 5 minutes to the current time to give a buffer
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  return now;
}

const tripSchema = insertTripSchema
  .extend({
    startDate: z.preprocess(
      // Ensure we have an actual Date object (crucial for validation)
      (val) => new Date(val as string | number | Date), 
      z.date({
        required_error: "Start date is required",
        invalid_type_error: "Start date must be a valid date"
      }).refine((date) => {
        // Check if date is in the future with 5 min buffer
        const now = getValidationDate();
        return date > now;
      }, {
        message: "Start date and time must be at least 5 minutes in the future"
      })
    ),
    endDate: z.preprocess(
      // Ensure we have an actual Date object (crucial for validation)
      (val) => new Date(val as string | number | Date),
      z.date({
        required_error: "End date is required",
        invalid_type_error: "End date must be a valid date"
      }).refine((date) => {
        // Check if date is in the future with 5 min buffer
        const now = getValidationDate();
        return date > now;
      }, {
        message: "End date and time must be at least 5 minutes in the future"
      })
    ),
  })
  .refine((data) => {
    // Use our datetime objects directly to ensure exact time comparison
    // This gives us a more precise comparison including time component
    return data.endDate >= data.startDate;
  }, {
    message: "End date and time cannot be before start date and time",
    path: ["endDate"],
  });

type TripFormValues = z.infer<typeof tripSchema>;

export function TripForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Fetch user's groups
  const { data: groups, isLoading: isLoadingGroups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Form
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      name: "",
      startLocation: "",
      destination: "",
      description: "",
      imageUrl: "",
      status: "planning",
    },
  });

  // Create trip mutation
  const mutation = useMutation({
    mutationFn: async (values: TripFormValues) => {
      const res = await apiRequest("POST", "/api/trips", values);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Success!",
        description: "Your trip has been created.",
      });
      navigate("/trips");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create trip: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Submit handler
  const onSubmit = (values: TripFormValues) => {
    if (!user) return;
    
    // Perform additional validation
    const now = new Date();
    
    // Check start date
    if (values.startDate <= now) {
      form.setError('startDate', {
        type: 'manual',
        message: 'Start date and time must be in the future'
      });
      return;
    }
    
    // Check end date
    if (values.endDate <= now) {
      form.setError('endDate', {
        type: 'manual',
        message: 'End date and time must be in the future'
      });
      return;
    }
    
    // Check that end date is after start date
    if (values.endDate < values.startDate) {
      form.setError('endDate', {
        type: 'manual',
        message: 'End date and time cannot be before start date and time'
      });
      console.log("Date validation failed:", {
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
        comparison: "invalid - end date before start date"
      });
      return;
    }
    
    // Additional validation logging
    console.log("Date validation passed:", {
      startDate: values.startDate.toISOString(),
      endDate: values.endDate.toISOString(),
      comparison: "valid"
    });
    
    // Add createdBy
    const createTrip: InsertTrip = {
      ...values,
      createdBy: user.id,
    };
    
    mutation.mutate(createTrip);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trip Name</FormLabel>
              <FormControl>
                <Input placeholder="Summer vacation" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="startLocation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Starting Location</FormLabel>
              <FormControl>
                <Input placeholder="Your departure city" {...field} value={field.value || ''} />
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
                <Input placeholder="Bali, Indonesia" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                          format(field.value, "PPP 'at' h:mm a")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                          if (date) {
                            // Keep the existing time if there's already a date selected
                            // otherwise set to noon in the user's local timezone
                            const newDate = new Date(date);
                            if (field.value) {
                              const currentDate = new Date(field.value);
                              newDate.setHours(currentDate.getHours());
                              newDate.setMinutes(currentDate.getMinutes());
                            } else {
                              // Default to current time + 1 hour (rounded to nearest 15 min)
                              const now = new Date();
                              const minutes = Math.ceil(now.getMinutes() / 15) * 15;
                              newDate.setHours(now.getHours());
                              newDate.setMinutes(minutes % 60);
                              if (minutes === 60) newDate.setHours(newDate.getHours() + 1);
                            }
                            setStartDate(newDate);
                            field.onChange(newDate);
                            
                            // Check if the selected time is valid
                            const now = new Date();
                            if (newDate <= now) {
                              form.setError('startDate', {
                                type: 'manual',
                                message: 'Start date and time must be in the future'
                              });
                            } else {
                              form.clearErrors('startDate');
                            }
                          }
                        }}
                        disabled={(date) => {
                          // For dates in the past, disable them
                          // For today, we'll use the time selector below
                          const today = new Date();
                          return date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        }}
                        initialFocus
                      />
                      
                      {startDate && (
                        <div className="mt-4 border-t pt-4 flex flex-col gap-2">
                          <h4 className="text-sm font-medium">Time</h4>
                          <div className="flex items-center gap-4">
                            <select 
                              className="flex h-10 w-[120px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={startDate.getHours()}
                              onChange={(e) => {
                                const newDate = new Date(startDate);
                                newDate.setHours(parseInt(e.target.value));
                                setStartDate(newDate);
                                field.onChange(newDate);
                                
                                // Trigger validation check
                                const now = new Date();
                                if (newDate <= now) {
                                  form.setError('startDate', {
                                    type: 'manual',
                                    message: 'Start date and time must be in the future'
                                  });
                                } else {
                                  form.clearErrors('startDate');
                                }
                              }}
                            >
                              {Array.from({length: 24}).map((_, i) => (
                                <option key={i} value={i}>
                                  {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                                </option>
                              ))}
                            </select>
                            <span>:</span>
                            <select
                              className="flex h-10 w-[120px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={startDate.getMinutes()}
                              onChange={(e) => {
                                const newDate = new Date(startDate);
                                newDate.setMinutes(parseInt(e.target.value));
                                setStartDate(newDate);
                                field.onChange(newDate);
                                
                                // Trigger validation check
                                const now = new Date();
                                if (newDate <= now) {
                                  form.setError('startDate', {
                                    type: 'manual',
                                    message: 'Start date and time must be in the future'
                                  });
                                } else {
                                  form.clearErrors('startDate');
                                }
                              }}
                            >
                              {[0, 15, 30, 45].map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
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
                          format(field.value, "PPP 'at' h:mm a")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(date) => {
                          if (date) {
                            // Keep the existing time if there's already a date selected
                            // otherwise set time based on start date or default
                            const newDate = new Date(date);
                            if (field.value) {
                              const currentDate = new Date(field.value);
                              newDate.setHours(currentDate.getHours());
                              newDate.setMinutes(currentDate.getMinutes());
                            } else if (startDate) {
                              // Use same time as the start date if available
                              newDate.setHours(startDate.getHours());
                              newDate.setMinutes(startDate.getMinutes());
                            } else {
                              // Default to current time + 2 hours (rounded to nearest 15 min)
                              const now = new Date();
                              const minutes = Math.ceil(now.getMinutes() / 15) * 15;
                              newDate.setHours(now.getHours() + 1); // An hour later than start time by default
                              newDate.setMinutes(minutes % 60);
                              if (minutes === 60) newDate.setHours(newDate.getHours() + 1);
                            }
                            setEndDate(newDate);
                            field.onChange(newDate);
                            
                            // Trigger validation check
                            const now = new Date();
                            if (newDate <= now) {
                              form.setError('endDate', {
                                type: 'manual',
                                message: 'End date and time must be in the future'
                              });
                            } else if (startDate && newDate < startDate) {
                              form.setError('endDate', {
                                type: 'manual',
                                message: 'End date cannot be before start date'
                              });
                            } else {
                              form.clearErrors('endDate');
                            }
                          }
                        }}
                        disabled={(date) => {
                          // For dates in the past or before start date, disable them
                          const today = new Date();
                          
                          // Allow selecting today, we'll validate the actual time with time picker
                          if (date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
                            return true;
                          }
                          
                          // If we have a start date, don't allow dates before the start date
                          if (startDate) {
                            const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                            if (date < startDay) return true;
                          }
                          
                          return false;
                        }}
                        initialFocus
                      />
                      
                      {endDate && (
                        <div className="mt-4 border-t pt-4 flex flex-col gap-2">
                          <h4 className="text-sm font-medium">Time</h4>
                          <div className="flex items-center gap-4">
                            <select 
                              className="flex h-10 w-[120px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={endDate.getHours()}
                              onChange={(e) => {
                                const newDate = new Date(endDate);
                                newDate.setHours(parseInt(e.target.value));
                                setEndDate(newDate);
                                field.onChange(newDate);
                                
                                // Trigger validation check
                                const now = new Date();
                                if (newDate <= now) {
                                  form.setError('endDate', {
                                    type: 'manual',
                                    message: 'End date and time must be in the future'
                                  });
                                } else if (startDate && newDate < startDate) {
                                  form.setError('endDate', {
                                    type: 'manual',
                                    message: 'End date cannot be before start date'
                                  });
                                } else {
                                  form.clearErrors('endDate');
                                }
                              }}
                            >
                              {Array.from({length: 24}).map((_, i) => (
                                <option key={i} value={i}>
                                  {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                                </option>
                              ))}
                            </select>
                            <span>:</span>
                            <select
                              className="flex h-10 w-[120px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={endDate.getMinutes()}
                              onChange={(e) => {
                                const newDate = new Date(endDate);
                                newDate.setMinutes(parseInt(e.target.value));
                                setEndDate(newDate);
                                field.onChange(newDate);
                                
                                // Trigger validation check
                                const now = new Date();
                                if (newDate <= now) {
                                  form.setError('endDate', {
                                    type: 'manual',
                                    message: 'End date and time must be in the future'
                                  });
                                } else if (startDate && newDate < startDate) {
                                  form.setError('endDate', {
                                    type: 'manual',
                                    message: 'End date cannot be before start date'
                                  });
                                } else {
                                  form.clearErrors('endDate');
                                }
                              }}
                            >
                              {[0, 15, 30, 45].map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute.toString().padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
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
                  placeholder="Tell us about your trip plans" 
                  className="resize-none" 
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
              <FormLabel>Image URL (optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/image.jpg" {...field} value={field.value || ''} />
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
              <Select onValueChange={field.onChange} defaultValue={field.value || 'planning'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
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
              <FormLabel>Travel Group</FormLabel>
              <Select 
                onValueChange={(value) => {
                  // Convert string to number before setting the value
                  field.onChange(value ? parseInt(value) : null);
                }} 
                defaultValue={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isLoadingGroups ? (
                    <SelectItem value="loading" disabled>Loading groups...</SelectItem>
                  ) : groups && groups.length > 0 ? (
                    groups.map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-groups" disabled>
                      No groups available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate("/trips")}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Creating..." : "Create Trip"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
