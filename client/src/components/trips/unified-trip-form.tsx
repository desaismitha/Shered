import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Plus, MapPin, Clock, Trash2, ArrowRight, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Group } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// Define schema for a single stop (used in multi-stop trips)
const stopSchema = z.object({
  day: z.number().min(1, "Day is required"),
  title: z.string().min(1, "Title is required"),
  startLocation: z.string().min(1, "Start location is required"),
  endLocation: z.string().min(1, "End location is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
});

// Define the form schema
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  description: z.string().optional(),
  groupId: z.number().optional(),
  isMultiStop: z.boolean().default(false),
  // Fields for single-stop trips
  startLocation: z.string().min(1, "Start location is required").optional(),
  endLocation: z.string().min(1, "End location is required").optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
  // For multi-stop trips
  stops: z.array(stopSchema).optional(),
}).refine((data) => {
  // Require start/end location for single-stop trips
  if (!data.isMultiStop) {
    return !!data.startLocation && !!data.endLocation;
  }
  // Require at least one stop for multi-stop trips
  return data.stops && data.stops.length > 0;
}, {
  message: data => data.isMultiStop 
    ? "At least one stop is required for multi-stop trips" 
    : "Start and end locations are required",
  path: data => data.isMultiStop ? ["stops"] : ["startLocation"],
});

// Type for the form
type FormData = z.infer<typeof formSchema>;

// Props for the component
interface UnifiedTripFormProps {
  onSubmit: (data: FormData) => void;
  defaultValues?: Partial<FormData>;
  isLoading?: boolean;
}

// Days of the week for recurring trips
const daysOfWeek = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

export function UnifiedTripForm({ onSubmit, defaultValues, isLoading = false }: UnifiedTripFormProps) {
  // Query for groups
  const { data: groups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Initialize the form
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: new Date(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 7)),
      isMultiStop: false,
      startLocation: "",
      endLocation: "",
      isRecurring: false,
      recurrencePattern: undefined,
      recurrenceDays: [],
      stops: [],
      ...defaultValues,
    },
  });

  // State for trip type selection
  const isMultiStop = form.watch("isMultiStop");
  const isRecurring = form.watch("isRecurring");
  const recurrencePattern = form.watch("recurrencePattern");
  const stops = form.watch("stops") || [];

  // Add a stop to multi-stop trips
  const addStop = () => {
    const currentStops = form.getValues("stops") || [];
    const nextDay = currentStops.length > 0 
      ? Math.max(...currentStops.map(stop => stop.day)) + 1 
      : 1;
    
    form.setValue("stops", [
      ...currentStops,
      {
        day: nextDay,
        title: "",
        startLocation: currentStops.length > 0 
          ? currentStops[currentStops.length - 1].endLocation 
          : "",
        endLocation: "",
        description: "",
        startTime: "",
        endTime: "",
      }
    ]);
  };

  // Remove a stop from multi-stop trips
  const removeStop = (index: number) => {
    const currentStops = form.getValues("stops") || [];
    form.setValue("stops", currentStops.filter((_, i) => i !== index));
  };

  // Update form validation on trip type change
  useEffect(() => {
    if (isMultiStop) {
      // If switching to multi-stop, initialize stops if empty
      const currentStops = form.getValues("stops");
      if (!currentStops || currentStops.length === 0) {
        form.setValue("stops", [{
          day: 1,
          title: form.getValues("name") || "Day 1",
          startLocation: form.getValues("startLocation") || "",
          endLocation: form.getValues("endLocation") || "",
          description: form.getValues("description") || "",
          startTime: form.getValues("startTime") || "",
          endTime: form.getValues("endTime") || "",
        }]);
      }
    }
  }, [isMultiStop, form]);

  // Form submission handler
  const handleSubmit = (data: FormData) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <Card className="p-6">
          <h2 className="text-lg font-medium mb-4">Trip Details</h2>
          
          <div className="grid gap-4 sm:grid-cols-2">
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
              name="groupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(parseInt(value) || undefined)}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">No group</SelectItem>
                      {groups?.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose a group to share this trip with
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
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
                          <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
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
                          <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="mt-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter trip description"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Card>
        
        <Card className="p-6">
          <h2 className="text-lg font-medium mb-4">Trip Type</h2>
          
          <div className="flex flex-col space-y-4">
            <FormField
              control={form.control}
              name="isMultiStop"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0 rounded-md border p-4">
                  <div className="space-y-1">
                    <FormLabel className="text-base">
                      {field.value ? "Multi-Stop Trip" : "Single Stop Trip"}
                    </FormLabel>
                    <FormDescription>
                      {field.value 
                        ? "Create a trip with multiple stops on different days" 
                        : "Create a simple trip with one start and end location"}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Card>
        
        {/* Single Stop Trip Form */}
        {!isMultiStop && (
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Route</h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Location</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Enter start location"
                          className="pl-8"
                          {...field}
                        />
                        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Location</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Enter end location"
                          className="pl-8"
                          {...field}
                        />
                        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          className="pl-8"
                          {...field}
                        />
                        <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="time"
                          className="pl-8"
                          {...field}
                        />
                        <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="mt-6">
              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Recurring Trip
                      </FormLabel>
                      <FormDescription>
                        Does this trip repeat on a schedule?
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            
            {isRecurring && (
              <div className="mt-4 border rounded-md p-4 bg-muted/30">
                <FormField
                  control={form.control}
                  name="recurrencePattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recurrence Pattern</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="daily" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Daily
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="weekly" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Weekly
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="custom" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Custom Days
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {recurrencePattern === "custom" && (
                  <FormField
                    control={form.control}
                    name="recurrenceDays"
                    render={() => (
                      <FormItem className="mt-4">
                        <div className="mb-2">
                          <FormLabel>Select Days</FormLabel>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {daysOfWeek.map((day) => (
                            <FormField
                              key={day.id}
                              control={form.control}
                              name="recurrenceDays"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={day.id}
                                    className="flex flex-row items-center space-x-1"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(day.id)}
                                        onCheckedChange={(checked) => {
                                          const currentValue = field.value || [];
                                          return checked
                                            ? field.onChange([...currentValue, day.id])
                                            : field.onChange(
                                                currentValue.filter(
                                                  (value) => value !== day.id
                                                )
                                              );
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal">
                                      {day.label}
                                    </FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
          </Card>
        )}
        
        {/* Multi-Stop Trip Form */}
        {isMultiStop && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Stops & Itinerary</h2>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addStop}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stop
              </Button>
            </div>
            
            {/* List of stops */}
            <div className="space-y-6">
              {stops.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No stops added yet. Click "Add Stop" to begin.</p>
                </div>
              )}
              
              {stops.map((stop, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 relative"
                >
                  <div className="absolute -top-3 left-4 bg-background px-2">
                    <Badge variant="outline">Day {stop.day}</Badge>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2 mt-2">
                    <FormField
                      control={form.control}
                      name={`stops.${index}.title`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stop Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter stop title" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex items-end space-x-2">
                      <div className="flex-1">
                        <FormField
                          control={form.control}
                          name={`stops.${index}.day`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Day Number</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="1" 
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mb-0.5"
                        onClick={() => removeStop(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2 mt-4">
                    <FormField
                      control={form.control}
                      name={`stops.${index}.startLocation`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Location</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                placeholder="Enter start location"
                                className="pl-8"
                                {...field}
                              />
                              <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`stops.${index}.endLocation`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Location</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                placeholder="Enter end location"
                                className="pl-8"
                                {...field}
                              />
                              <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2 mt-4">
                    <FormField
                      control={form.control}
                      name={`stops.${index}.startTime`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time (Optional)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="time"
                                className="pl-8"
                                {...field}
                              />
                              <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`stops.${index}.endTime`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time (Optional)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="time"
                                className="pl-8"
                                {...field}
                              />
                              <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name={`stops.${index}.description`}
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter description for this stop"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
            
            {stops.length > 0 && (
              <div className="mt-6 text-sm text-muted-foreground">
                <p className="flex items-center">
                  <Repeat className="h-4 w-4 mr-2" />
                  <span>Recurring options are not available for multi-stop trips</span>
                </p>
              </div>
            )}
          </Card>
        )}
        
        <div className="flex items-center justify-end space-x-4">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : isMultiStop ? "Create Multi-Stop Trip" : "Create Trip"}
          </Button>
        </div>
      </form>
    </Form>
  );
}