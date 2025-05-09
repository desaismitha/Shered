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
  name: z.string().min(1, "Name is required"),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  description: z.string().optional(),
  groupId: z.number().optional(),
  status: z.enum(["planning", "confirmed", "in-progress", "completed", "cancelled"]).default("planning"),
  isMultiStop: z.boolean().default(false),
  startLocation: z.string().min(1, "Start location is required"),
  endLocation: z.string().min(1, "Destination is required"),
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
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isMultiStop, setIsMultiStop] = useState(defaultValues?.isMultiStop || false);
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  
  // Fetch user's phone number and groups
  const { data: groups } = useQuery({
    queryKey: ['/api/groups'],
  });
  
  // Initialize the form
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: new Date(),
      endDate: new Date(),
      groupId: undefined,
      status: "planning",
      isMultiStop: false,
      startLocation: "",
      endLocation: "",
      startTime: "09:00",
      endTime: "17:00",
      isRecurring: false,
      recurrencePattern: undefined,
      recurrenceDays: undefined,
      enableMobileNotifications: true,
      phoneNumber: "",
      stops: [],
      ...defaultValues
    }
  });
  
  // Watch isMultiStop value
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'isMultiStop') {
        setIsMultiStop(value.isMultiStop || false);
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);
  
  // This function will be called when the form is submitted
  const handleSubmit = (data: FormData) => {
    setFormData(data);
    
    try {
      onSubmit(data);
    } catch (error: any) {
      console.error("Form submission error:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred while submitting the form.",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto">
      <Form {...form}>
        <form 
          onSubmit={(e) => { 
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
                      Group members will be notified about the {tripType}
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
                    <FormLabel>Start Date *</FormLabel>
                    <DatePicker 
                      selected={field.value} 
                      onSelect={field.onChange}
                    />
                    <FormDescription>
                      When will the {tripType} start?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date *</FormLabel>
                    <DatePicker 
                      selected={field.value} 
                      onSelect={field.onChange}
                    />
                    <FormDescription>
                      When will the {tripType} end?
                    </FormDescription>
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tripType === 'event' ? 'Event Status *' : 'Trip Status *'}</FormLabel>
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
                      Current status of your {tripType}
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
          
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">{tripType === 'event' ? 'Event Type' : 'Trip Type'}</h2>
            
            <div className="flex flex-col space-y-4">
              <FormField
                control={form.control}
                name="isMultiStop"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0 rounded-md border p-4">
                    <div className="space-y-1">
                      <FormLabel className="text-base">
                        {field.value 
                          ? (tripType === 'event' ? "Multi-Day Event" : "Multi-Stop Trip") 
                          : (tripType === 'event' ? "Single Day Event" : "Single Stop Trip")}
                      </FormLabel>
                      <FormDescription>
                        {field.value 
                          ? (tripType === 'event' 
                             ? "Create an event with multiple activities on different days" 
                             : "Create a trip with multiple stops on different days")
                          : (tripType === 'event'
                             ? "Create a simple event with one location"
                             : "Create a simple trip with one start and end location")}
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
          
          {/* Location Information Card */}
          {!isMultiStop && (
            <Card className="p-6">
              <h2 className="text-lg font-medium mb-4">{tripType === 'event' ? 'Event Location' : 'Location Information'}</h2>
              
              {tripType === 'event' ? (
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
                // For trips, show both start and destination
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
              )}
              
              {form.watch("startLocation") && form.watch("endLocation") && (
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
                  </p>
                  <ul className="list-disc ml-6 mt-1 text-sm text-blue-700">
                    <li>{tripType === 'event' ? 'Event' : 'Trip'} status changes (planning, confirmed, in-progress, completed)</li>
                    <li>Someone deviates from the planned route</li>
                    <li>Important {tripType} updates occur</li>
                  </ul>
                  <p className="text-sm text-blue-700 mt-1">
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
    </div>
  );
}