import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Group } from "@shared/schema";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import MapLocationPicker from "@/components/maps/map-location-picker";
import RouteMapPreview from "@/components/maps/route-map-preview";

type FormSchemaType = {
  name: string;
  startDate: Date;
  endDate: Date;
  description?: string;
  groupId?: number;
  scheduleType?: "regular" | "event";
  status: "planning" | "confirmed" | "in-progress" | "completed" | "cancelled";
  isMultiStop: boolean;
  startLocation?: string;
  endLocation?: string;
  startTime?: string;
  endTime?: string;
  isRecurring: boolean;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "custom";
  recurrenceDays?: string[];
  enableEmailNotifications: boolean;
  enableMobileNotifications: boolean;
  phoneNumber?: string;
  stops?: Array<{
    day: number;
    title: string;
    startLocation: string;
    endLocation: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    isRecurring?: boolean;
    recurrencePattern?: "daily" | "weekly" | "monthly" | "custom";
    recurrenceDays?: string[];
  }>;
};

const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  startDate: z.date({
    required_error: "Start date is required"
  })
  .refine(
    (date) => {
      // Ensure start date is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to beginning of day
      return date >= today;
    },
    {
      message: "Start date cannot be in the past",
    }
  ),
  endDate: z.date({
    required_error: "End date is required"
  })
  .refine(
    (date) => {
      return true; // We'll handle this validation separately
    },
    {
      message: "End date must be after or equal to start date",
    }
  ),
  description: z.string().optional(),
  groupId: z.number().optional(),
  // Add scheduleType field
  scheduleType: z.enum(["regular", "event"]).default("regular"),
  status: z.enum(["planning", "confirmed", "in-progress", "completed", "cancelled"]).default("planning"),
  isMultiStop: z.boolean().default(false),
  startLocation: z.string().min(1, "Start location is required"),
  // For endLocation, only require it for regular schedules
  endLocation: z.string().optional(),
  startTime: z.string({
    required_error: "Start time is required"
  }),
  endTime: z.string({
    required_error: "End time is required"
  })
,
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
  enableEmailNotifications: z.boolean().default(true),
  enableMobileNotifications: z.boolean().default(true),
  phoneNumber: z.string().optional(),
  stops: z.array(
    z.object({
      day: z.number(),
      title: z.string(),
      startLocation: z.string(),
      endLocation: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      description: z.string().optional(),
      isRecurring: z.boolean().optional(),
      recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
      recurrenceDays: z.array(z.string()).optional(),
    })
  ).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface UnifiedTripFormProps {
  onSubmit: (data: FormData) => void;
  onCancel?: () => void;
  defaultValues?: Partial<FormData>;
  isLoading?: boolean;
  isEditing?: boolean;
  tripType?: 'trip' | 'event';
  isSubmitting?: boolean;
  groupMembers?: any[];
}

export function UnifiedTripForm({ 
  onSubmit, 
  onCancel, 
  defaultValues, 
  isLoading = false,
  isEditing = false,
  tripType = 'trip',
  isSubmitting = false,
  groupMembers = []
}: UnifiedTripFormProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Get current user data
  const { data: userData } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...{
        name: "",
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 15 * 60 * 1000),
        startTime: new Date().toTimeString().substring(0, 5),
        endTime: new Date(new Date().getTime() + 15 * 60 * 1000).toTimeString().substring(0, 5),
        description: "",
        status: "planning",
        isMultiStop: false,
        startLocation: "",
        endLocation: "",
        isRecurring: false,
        enableEmailNotifications: true,
        enableMobileNotifications: true,
        phoneNumber: "",
        stops: [],
      },
      ...defaultValues,
    },
  });
  
  // Add query for groups
  const { data: groups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });
  
  // State for stop form
  const [isMultiStop, setIsMultiStop] = useState(form.getValues("isMultiStop"));
  
  // Watch changes to isMultiStop
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "isMultiStop") {
        setIsMultiStop(!!value.isMultiStop);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form.watch]);

  const handleSubmit = (data: FormData) => {
    console.log('Form submitted with data:', data);
    console.log('Current user data:', userData);
    
    // Make sure the email notifications setting is included
    console.log('Submitting form with email notifications setting:', data.enableEmailNotifications);
    console.log('Submitting form with mobile notifications setting:', data.enableMobileNotifications);
    
    // Call the onSubmit prop provided by the parent component
    onSubmit({
      ...data,
      enableEmailNotifications: data.enableEmailNotifications === undefined ? true : data.enableEmailNotifications,
      enableMobileNotifications: data.enableMobileNotifications === undefined ? true : data.enableMobileNotifications
    });
  };

  // Debug logging
  console.log('Form component default values:', defaultValues);
  console.log('FORM STATE:', { 
    enableMobileNotifications: form.watch("enableMobileNotifications"),
    userData: userData
  });
  
  // Log time values received for debugging
  useEffect(() => {
    console.log('Default time values received by form:', {
      startTime: defaultValues?.startTime,
      endTime: defaultValues?.endTime
    });
  }, [defaultValues?.startTime, defaultValues?.endTime]);

  return (
    <div className="trip-form-container">
      <div className="mb-4 text-sm text-gray-600">
        Fields marked with an asterisk (*) are required.
      </div>
      <Form {...form}>
        <form 
          onSubmit={form.handleSubmit((data) => {
            console.log('Form submitted successfully!', data);
            
            // Explicitly add notification settings
            const formattedData = {
              ...data,
              enableEmailNotifications: data.enableEmailNotifications === undefined ? true : data.enableEmailNotifications,
              enableMobileNotifications: data.enableMobileNotifications === undefined ? true : data.enableMobileNotifications
            };
            
            // Call the onSubmit handler with the formatted data
            onSubmit(formattedData);
          })}
          className="space-y-8">
          
          {/* Basic Details Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">{tripType === 'event' ? 'Event Details' : 'Trip Details'}</h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tripType === 'event' ? 'Event Name *' : 'Trip Name *'}</FormLabel>
                    <FormControl>
                      <Input placeholder={`Enter ${tripType} name`} {...field} />
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
                      onValueChange={(value) => {
                        if (value === "none") {
                          field.onChange(undefined);
                        } else {
                          field.onChange(parseInt(value));
                        }
                      }}
                      value={field.value?.toString() || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No group</SelectItem>
                        {groups?.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose a group to share this {tripType} with
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="mt-4">
              <FormField
                control={form.control}
                name="scheduleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select schedule type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="regular">Regular Schedule</SelectItem>
                        <SelectItem value="event">Event Schedule</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {form.watch("scheduleType") === "event" 
                        ? "Event schedules are for one-location events" 
                        : "Regular schedules include start location and destination"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="mt-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Current status of the {tripType}
                    </FormDescription>
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
                        placeholder={`Describe the ${tripType}...`} 
                        className="min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Add any relevant details about the {tripType}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Card>
          
          {/* Date and Time Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Date and Time</h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <DatePicker field={field} label="Start Date *" />
                )}
              />
              
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <DatePicker field={field} label="End Date *" />
                )}
              />
            </div>
            
            {/* Recurring Options - only show for regular schedules */}
            {form.watch("scheduleType") !== "event" && (
              <div className="mt-4 border rounded-md p-4">
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0">
                      <div className="space-y-1">
                        <FormLabel className="text-base">
                          Recurring Schedule
                        </FormLabel>
                        <FormDescription>
                          {field.value 
                            ? "Schedule repeats based on pattern" 
                            : "One-time schedule that occurs only on the selected date"}
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
                
                {form.watch("isRecurring") && (
                  <div className="mt-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="recurrencePattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recurrence Pattern</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select pattern" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            How often does this schedule repeat?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {form.watch("recurrencePattern") === "weekly" && (
                      <div className="space-y-2">
                        <FormLabel>Select Days</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                            <Button
                              key={day}
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`${
                                form.watch("recurrenceDays")?.includes(day.toLowerCase())
                                  ? "bg-primary text-primary-foreground"
                                  : ""
                              }`}
                              onClick={() => {
                                const currentDays = form.watch("recurrenceDays") || [];
                                const dayLower = day.toLowerCase();
                                
                                if (currentDays.includes(dayLower)) {
                                  form.setValue(
                                    "recurrenceDays",
                                    currentDays.filter((d) => d !== dayLower)
                                  );
                                } else {
                                  form.setValue("recurrenceDays", [...currentDays, dayLower]);
                                }
                              }}
                            >
                              {day.substring(0, 3)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>
                      What time will the {tripType} start?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>
                      What time will the {tripType} end?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Card>
          
          {/* Location Information Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">{form.watch("scheduleType") === 'event' ? 'Event Location' : 'Location Information'}</h2>
            
            {/* Add Multi-Stop option near location information for regular schedules */}
            {form.watch("scheduleType") !== "event" && (
              <div className="mb-4 border rounded-md p-4">
                <FormField
                  control={form.control}
                  name="isMultiStop"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0">
                      <div className="space-y-1">
                        <FormLabel className="text-base">
                          Multi-Stop Schedule
                        </FormLabel>
                        <FormDescription>
                          {field.value 
                            ? "Schedule includes multiple stops on different days" 
                            : "Single schedule with one start and end location"}
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
            )}
            
            {form.watch("scheduleType") === 'event' ? (
              // For events, just show one location field
              <div className="grid gap-6">
                <FormField
                  control={form.control}
                  name="startLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Location *</FormLabel>
                      <FormControl>
                        <MapLocationPicker 
                          label=""
                          value={field.value || ""} 
                          onChange={(value) => {
                            // Update both startLocation and endLocation with the same value
                            field.onChange(value);
                            form.setValue("endLocation", value);
                          }}
                          placeholder="Enter event location"
                        />
                      </FormControl>
                      <FormDescription>
                        Where the event takes place
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              // For trips, show both start and destination if not multi-stop
              !isMultiStop && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Location *</FormLabel>
                        <FormControl>
                          <MapLocationPicker 
                            label=""
                            value={field.value || ""} 
                            onChange={field.onChange}
                            placeholder="Enter start location"
                          />
                        </FormControl>
                        <FormDescription>
                          Where the trip begins
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="endLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination *</FormLabel>
                        <FormControl>
                          <MapLocationPicker 
                            label=""
                            value={field.value || ""} 
                            onChange={field.onChange}
                            placeholder="Enter destination"
                          />
                        </FormControl>
                        <FormDescription>
                          Where the trip ends
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )
            )}
            
            {form.watch("startLocation") && (form.watch("scheduleType") === "event" || form.watch("endLocation")) && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-2">Route Preview</h3>
                <div className="h-[300px] border rounded-md overflow-hidden">
                  <RouteMapPreview 
                    startLocation={form.watch("startLocation") || ""} 
                    endLocation={form.watch("endLocation") || ""}
                    showMap={true}
                  />
                </div>
              </div>
            )}
          </Card>
          
          {/* Notifications Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Notifications</h2>
            
            <div className="flex flex-col space-y-4">
              <FormField
                control={form.control}
                name="enableEmailNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Email Notifications
                      </FormLabel>
                      <FormDescription>
                        Receive email notifications for schedule status changes and route deviations
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

              <FormField
                control={form.control}
                name="enableMobileNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Mobile Notifications
                      </FormLabel>
                      <FormDescription>
                        Receive SMS notifications for important schedule updates
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
          
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : (isEditing ? "Update" : "Create")} {tripType === 'event' ? 'Event' : 'Schedule'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}