import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Car, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

// Define the form schema
const tripFormSchema = z.object({
  name: z.string().min(2, "Trip name must be at least 2 characters"),
  description: z.string().optional(),
  isMultiStop: z.boolean().default(false),
  
  // For both single and multi-stop trips
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  
  // For single-stop trips
  startLocation: z.string().optional(),
  endLocation: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  
  // Recurrence
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
  
  // For multi-stop trips
  stops: z.array(
    z.object({
      day: z.number(),
      title: z.string(),
      startLocation: z.string(),
      endLocation: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      description: z.string().optional(),
    })
  ).default([]),
  
  groupId: z.number().optional(),
});

type TripFormValues = z.infer<typeof tripFormSchema>;

// Recurrence day options
const weekdays = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

interface UnifiedTripFormProps {
  onSubmit: (data: TripFormValues) => void;
  defaultValues?: Partial<TripFormValues>;
  isLoading?: boolean;
}

export function UnifiedTripForm({ 
  onSubmit, 
  defaultValues = {}, 
  isLoading = false 
}: UnifiedTripFormProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultValues.isMultiStop ? "multi-stop" : "single-stop");
  
  // Initialize form with default values
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isMultiStop: false,
      startDate: new Date(),
      endDate: new Date(),
      startLocation: "",
      endLocation: "",
      startTime: "",
      endTime: "",
      isRecurring: false,
      recurrencePattern: undefined,
      recurrenceDays: [],
      stops: [],
      ...defaultValues,
    },
  });
  
  // Watch form values to update UI
  const isMultiStop = form.watch("isMultiStop");
  const isRecurring = form.watch("isRecurring");
  const recurrencePattern = form.watch("recurrencePattern");
  const stops = form.watch("stops");

  // Toggle between single and multi-stop trips
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    form.setValue("isMultiStop", value === "multi-stop");
  };
  
  // Add a new stop for multi-stop trips
  const addStop = () => {
    const currentStops = form.getValues("stops") || [];
    const newDay = currentStops.length > 0 
      ? Math.max(...currentStops.map(stop => stop.day)) + 1 
      : 1;
    
    form.setValue("stops", [
      ...currentStops,
      {
        day: newDay,
        title: `Day ${newDay} Stop`,
        startLocation: "",
        endLocation: "",
        startTime: "",
        endTime: "",
        description: "",
      }
    ]);
  };
  
  // Remove a stop
  const removeStop = (index: number) => {
    const currentStops = form.getValues("stops");
    form.setValue(
      "stops",
      currentStops.filter((_, i) => i !== index)
    );
  };
  
  // Form submission
  const handleFormSubmit = (values: TripFormValues) => {
    // Ensure the form data is correctly structured based on the trip type
    const formattedValues = {
      ...values,
      // If it's a single-stop trip, we don't need the stops array
      stops: values.isMultiStop ? values.stops : [],
    };
    
    onSubmit(formattedValues);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {defaultValues.name ? "Edit Trip" : "Create New Trip"}
        </h2>
        <Badge variant={isMultiStop ? "default" : "outline"}>
          {isMultiStop ? "Multi-Stop Trip" : "Single-Stop Trip"}
        </Badge>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Basic Trip Details */}
          <Card>
            <CardHeader>
              <CardTitle>Trip Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter trip description" 
                        className="resize-none" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                name="isMultiStop"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Trip Type</FormLabel>
                      <FormDescription>
                        Choose between a simple trip or multi-stop journey
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Tabs
                        value={activeTab}
                        onValueChange={handleTabChange}
                        className="w-[300px]"
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="single-stop">Single Stop</TabsTrigger>
                          <TabsTrigger value="multi-stop">Multi-Stop</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          {/* Trip-specific content based on type */}
          {!isMultiStop ? (
            // Single-stop trip fields
            <Card>
              <CardHeader>
                <CardTitle>Trip Route</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Location</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter starting location" {...field} value={field.value || ""} />
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
                          <Input placeholder="Enter destination" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} value={field.value || ""} />
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
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Recurrence options for single-stop trips */}
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Recurring Trip</FormLabel>
                        <FormDescription>
                          Enable if this trip repeats on a schedule
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                
                {isRecurring && (
                  <div className="space-y-4 bg-muted/40 p-4 rounded-lg border">
                    <FormField
                      control={form.control}
                      name="recurrencePattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recurrence Pattern</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a pattern" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="custom">Custom Days</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {recurrencePattern === "custom" && (
                      <FormField
                        control={form.control}
                        name="recurrenceDays"
                        render={() => (
                          <FormItem>
                            <div className="mb-4">
                              <FormLabel className="text-base">Select Days</FormLabel>
                              <FormDescription>
                                Choose which days of the week this trip occurs
                              </FormDescription>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {weekdays.map((day) => (
                                <FormField
                                  key={day.value}
                                  control={form.control}
                                  name="recurrenceDays"
                                  render={({ field }) => {
                                    return (
                                      <FormItem
                                        key={day.value}
                                        className="flex flex-row items-start space-x-3 space-y-0"
                                      >
                                        <FormControl>
                                          <Checkbox
                                            checked={field.value?.includes(day.value)}
                                            onCheckedChange={(checked) => {
                                              return checked
                                                ? field.onChange([...field.value || [], day.value])
                                                : field.onChange(
                                                    field.value?.filter(
                                                      (value) => value !== day.value
                                                    )
                                                  );
                                            }}
                                          />
                                        </FormControl>
                                        <FormLabel className="font-normal">
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
              </CardContent>
            </Card>
          ) : (
            // Multi-stop trip fields
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Trip Stops</CardTitle>
                  <Button type="button" onClick={addStop} variant="outline" size="sm">
                    <Plus className="mr-1 h-4 w-4" /> Add Stop
                  </Button>
                </CardHeader>
                <CardContent>
                  {stops.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Car className="h-12 w-12 mx-auto mb-3 opacity-25" />
                      <p>No stops added yet</p>
                      <p className="text-sm">Add stops to create your multi-stop trip</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {stops.map((stop, index) => (
                        <div key={index} className="relative border rounded-lg p-4 bg-background">
                          <div className="absolute top-3 right-3 flex gap-2">
                            <Badge variant="outline">Day {stop.day}</Badge>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => removeStop(index)}
                              className="h-6 w-6"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="space-y-4 mt-6">
                            <FormField
                              control={form.control}
                              name={`stops.${index}.title`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Stop Title</FormLabel>
                                  <FormControl>
                                    <Input {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name={`stops.${index}.startLocation`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>From</FormLabel>
                                    <FormControl>
                                      <Input {...field} />
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
                                    <FormLabel>To</FormLabel>
                                    <FormControl>
                                      <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name={`stops.${index}.startTime`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Start Time</FormLabel>
                                    <FormControl>
                                      <Input type="time" {...field} value={field.value || ""} />
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
                                    <FormLabel>End Time</FormLabel>
                                    <FormControl>
                                      <Input type="time" {...field} value={field.value || ""} />
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
                                <FormItem>
                                  <FormLabel>Description (Optional)</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      className="resize-none" 
                                      {...field} 
                                      value={field.value || ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          {/* Route visualization */}
                          {stop.startLocation && stop.endLocation && (
                            <div className="mt-4 pt-4 border-t flex items-center justify-center">
                              <div className="flex items-center text-muted-foreground">
                                <span className="font-medium">{stop.startLocation}</span>
                                <ArrowRight className="mx-2 h-4 w-4" />
                                <span className="font-medium">{stop.endLocation}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {stops.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={addStop} 
                        className="w-full"
                      >
                        <Plus className="mr-2 h-4 w-4" /> 
                        Add Another Stop
                      </Button>
                    </div>
                  )}
                  
                  {stops.length === 0 && (
                    <div className="mt-6">
                      <Button 
                        type="button" 
                        variant="default" 
                        onClick={addStop} 
                        className="w-full"
                      >
                        <Plus className="mr-2 h-4 w-4" /> 
                        Add First Stop
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Preview of the full journey */}
              {stops.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Journey Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      {stops.map((stop, index) => (
                        <div key={index} className="flex items-start mb-4">
                          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mr-4 relative">
                            <span className="font-bold text-primary">{stop.day}</span>
                            {index < stops.length - 1 && (
                              <div className="absolute w-[2px] bg-border h-12 top-12 left-1/2 transform -translate-x-1/2"></div>
                            )}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{stop.title}</h4>
                            <div className="text-sm text-muted-foreground flex items-center mt-1">
                              <span>{stop.startLocation}</span>
                              <ArrowRight className="mx-1 h-3 w-3" />
                              <span>{stop.endLocation}</span>
                            </div>
                            {stop.startTime && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {stop.startTime} {stop.endTime && `- ${stop.endTime}`}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Trip"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}