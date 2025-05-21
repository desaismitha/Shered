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
// No phone verification needed for email notifications
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
// These forms are not needed for email notifications
// import { StopItineraryForm } from "./stop-itinerary-form";
// import { RecurrenceForm } from "./recurrence-form";

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
  }),
  endDate: z.date({
    required_error: "End date is required"
  }),
  description: z.string().optional(),
  groupId: z.number().optional(),
  // Add scheduleType field
  scheduleType: z.enum(["regular", "event"]).default("regular"),
  status: z.enum(["planning", "confirmed", "in-progress", "completed", "cancelled"]).default("planning"),
  isMultiStop: z.boolean().default(false),
  startLocation: z.string().min(1, "Start location is required"),
  // For endLocation, only require it for regular schedules
  endLocation: z.string().refine(
    (val, ctx) => {
      // For event schedules, we don't require an end location
      if (ctx.data?.scheduleType === 'event') {
        return true;
      }
      // For regular schedules, require endLocation to be non-empty
      if ((!val || val.trim() === '')) {
        return false;
      }
      return true;
    },
    {
      message: "Destination is required for regular schedules",
    }
  ),
  startTime: z.string({
    required_error: "Start time is required"
  }),
  endTime: z.string({
    required_error: "End time is required"
  }),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
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

  // No phone verification state needed for email notifications

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      startDate: new Date(),
      endDate: new Date(),
      description: "",
      status: "planning",
      isMultiStop: false,
      startLocation: "",
      endLocation: "",
      isRecurring: false,
      enableMobileNotifications: true, // Enable notifications by default for status changes and route deviations
      phoneNumber: "",
      stops: [],
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
    
    // Submit form directly - no phone verification needed for email notifications
    console.log('Submitting form with email notifications setting:', data.enableMobileNotifications);
    onSubmit(data);
  };

  // Debug logging (simplified without phone verification)
  console.log('Form component default values:', defaultValues);
  console.log('FORM STATE:', { 
    enableMobileNotifications: form.watch("enableMobileNotifications"),
    startTime: form.watch("startTime"),
    endTime: form.watch("endTime"),
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
          onSubmit={(e) => {
            console.log('Form submitted via form event');
            e.preventDefault(); 
            form.handleSubmit(handleSubmit)(e);
          }} 
          className="space-y-8">
          
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
            
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
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
                          {field.value ? "Recurring Schedule" : "One-time Schedule"}
                        </FormLabel>
                        <FormDescription>
                          {field.value 
                            ? "Schedule repeats based on pattern" 
                            : "Schedule occurs only once on the selected date"}
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
            
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FormField
                control={form.control}
                name="scheduleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Type *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // When switching to event type, clear destination field
                        if (value === "event") {
                          form.setValue("endLocation", "");
                        }
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="regular">Regular Schedule</SelectItem>
                        <SelectItem value="event">Event Schedule</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose between a regular trip or an event
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{form.watch("scheduleType") === 'event' ? 'Event Status *' : 'Schedule Status *'}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
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
                      Current status of your {form.watch("scheduleType") === 'event' ? 'event' : 'schedule'}
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
                        placeholder={`Enter ${tripType} description`}
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
          
          {/* We've removed the Trip Type box as requested */}
          
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
                          {field.value ? "Multi-Stop Schedule" : "Single Stop Schedule"}
                        </FormLabel>
                        <FormDescription>
                          {field.value 
                            ? "Create a schedule with multiple stops on different days" 
                            : "Create a simple schedule with one start and end location"}
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
                  
                  {/* Only show destination field for regular schedules */}
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
          )}
          
          {/* Email Notifications Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Email Notifications</h2>
            
            <div className="flex flex-col space-y-4">
              <FormField
                control={form.control}
                name="enableMobileNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0 rounded-md border p-4">
                    <div className="space-y-1">
                      <FormLabel className="text-base">
                        {tripType === 'event' ? 'Event Notifications' : 'Trip Notifications'}
                      </FormLabel>
                      <FormDescription>
                        Receive email notifications for {tripType} status changes and route deviations
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
              
              {form.watch("enableMobileNotifications") && (
                <div className="px-4 py-3 rounded-md bg-blue-50 border border-blue-200">
                  <p className="text-sm text-blue-700">
                    Email notifications will be sent when:
                    <ul className="list-disc ml-6 mt-1">
                      <li>{tripType === 'event' ? 'Event' : 'Trip'} status changes (planning, confirmed, in-progress, completed)</li>
                      <li>Someone deviates from the planned route</li>
                      <li>Important {tripType} updates occur</li>
                    </ul>
                    Make sure all group members have verified their email addresses.
                  </p>
                </div>
              )}
            </div>
          </Card>
          
          <div className="flex justify-end items-center space-x-4 mt-8">
            <div className="flex space-x-4">
              {onCancel && (
                <button 
                  type="button" 
                  onClick={onCancel} 
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
                disabled={isLoading}>
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  isEditing ? "Save Changes" : (
                    isMultiStop 
                      ? (tripType === 'event' ? "Create Multi-Day Event" : "Create Multi-Stop Trip")
                      : (tripType === 'event' ? "Create Event" : "Create Trip")
                  )
                )}
              </button>
            </div>
          </div>
        </form>
      </Form>
      
      {/* No phone verification modal needed for email notifications */}
    </div>
  );
}