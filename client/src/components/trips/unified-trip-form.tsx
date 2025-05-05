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
import { PhoneVerificationModal } from "./phone-verification-modal";
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
import { MapLocationPicker } from "@/components/map/map-location-picker";
import { RouteMapPreview } from "@/components/map/route-map-preview";
import { StopItineraryForm } from "./stop-itinerary-form";
import { RecurrenceForm } from "./recurrence-form";

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
  name: z.string().min(3, "Name must be at least 3 characters"),
  startDate: z.date(),
  endDate: z.date(),
  description: z.string().optional(),
  groupId: z.number().optional(),
  status: z.enum(["planning", "confirmed", "in-progress", "completed", "cancelled"]).default("planning"),
  isMultiStop: z.boolean().default(false),
  startLocation: z.string().optional(),
  endLocation: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  recurrenceDays: z.array(z.string()).optional(),
  enableMobileNotifications: z.boolean().default(false),
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
}

export function UnifiedTripForm({ 
  onSubmit, 
  onCancel, 
  defaultValues, 
  isLoading = false,
  isEditing = false 
}: UnifiedTripFormProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Get current user data
  const { data: userData } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  // Phone verification state
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [formDataForSubmission, setFormDataForSubmission] = useState<FormData | null>(null);

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
      enableMobileNotifications: false,
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
    
    // If mobile notifications are enabled, check for phone verification
    if (data.enableMobileNotifications && data.phoneNumber) {
      console.log('Mobile notifications enabled with phone number:', data.phoneNumber);
      
      // Always show verification modal if enabling notifications
      // This is a temporary fix to force the modal to show
      setFormDataForSubmission(data);
      setShowPhoneVerification(true);
      console.log('Setting showPhoneVerification to TRUE');
      return;
    }
    
    // Submit as normal if no verification needed
    console.log('No verification needed, submitting form');
    onSubmit(data);
  };

  const handlePhoneVerificationComplete = () => {
    console.log('Phone verification completed');
    setShowPhoneVerification(false);
    
    // Refresh user data to get updated phoneNumber status
    // This would be handled by react-query invalidation

    if (formDataForSubmission) {
      console.log('Submitting form data after verification completed:', formDataForSubmission);
      onSubmit(formDataForSubmission);
      setFormDataForSubmission(null);
    }
  };
  
  // Add a button to manually test the verification modal
  const debugShowVerificationModal = () => {
    console.log('Debug showing verification modal');
    
    // If no phone number is set in the form, use the one from user data
    // or set a default test number
    const currentPhoneNumber = form.getValues("phoneNumber");
    if (!currentPhoneNumber && userData?.phoneNumber) {
      form.setValue("phoneNumber", userData.phoneNumber);
      console.log('Setting phone number from user data:', userData.phoneNumber);
    } else if (!currentPhoneNumber) {
      form.setValue("phoneNumber", "+14258353425"); // Default test number
      console.log('Setting default test phone number: +14258353425');
    }
    
    // Force the modal to show
    setShowPhoneVerification(true);
    console.log('Phone number being used:', form.getValues("phoneNumber"));
  };

  // Debug logging
  console.log('Form component default values:', defaultValues);
  console.log('RENDERING PHONE VERIFICATION MODAL STATE:', { 
    showPhoneVerification, 
    formDataForSubmission,
    enableMobileNotifications: form.watch("enableMobileNotifications"),
    phoneNumber: form.watch("phoneNumber"),
    userData: userData
  });

  return (
    <div className="trip-form-container">
      <Form {...form}>
        <form 
          onSubmit={(e) => {
            console.log('Form submitted via form event');
            e.preventDefault(); 
            form.handleSubmit(handleSubmit)(e);
          }} 
          className="space-y-8">
          
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
                  <DatePicker field={field} label="Start Date" />
                )}
              />
              
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <DatePicker field={field} label="End Date" />
                )}
              />
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Status</FormLabel>
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
                      Current status of your trip
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
          
          {/* Mobile Notifications Card */}
          <Card className="p-6">
            <h2 className="text-lg font-medium mb-4">Mobile Notifications</h2>
            
            <div className="flex flex-col space-y-4">
              <FormField
                control={form.control}
                name="enableMobileNotifications"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-3 space-y-0 rounded-md border p-4">
                    <div className="space-y-1">
                      <FormLabel className="text-base">
                        Route Change Notifications
                      </FormLabel>
                      <FormDescription>
                        Receive SMS notifications when someone deviates from the planned route
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
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your phone number (e.g., +1234567890)" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Phone number must include country code (e.g., +1 for US)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </Card>
          
          <div className="flex justify-between items-center space-x-4 mt-8">
            <button 
              type="button" 
              onClick={debugShowVerificationModal} 
              className="px-4 py-2 border border-red-300 rounded-md text-red-700 hover:bg-red-50">
              Test Phone Verification Modal
            </button>
            
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
                  isEditing ? "Save Changes" : (isMultiStop ? "Create Multi-Stop Trip" : "Create Trip")
                )}
              </button>
            </div>
          </div>
        </form>
      </Form>
      
      {/* Phone Verification Modal outside the form */}
      {showPhoneVerification && (
        <PhoneVerificationModal
          isOpen={showPhoneVerification}
          onClose={() => setShowPhoneVerification(false)}
          onComplete={handlePhoneVerificationComplete}
          phoneNumber={form.getValues("phoneNumber") || ""}
        />
      )}
    </div>
  );
}