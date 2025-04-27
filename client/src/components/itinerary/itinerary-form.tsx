import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertItineraryItemSchema, InsertItineraryItem } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Clock, 
  MapPin, 
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define weekday options
const weekdays = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

// Define recurrence pattern options
const recurrencePatterns = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays (Mon-Fri)" },
  { value: "weekends", label: "Weekends (Sat-Sun)" },
  { value: "specific-days", label: "Specific days" },
];

// Extend the itinerary item schema for the form
const itineraryFormSchema = insertItineraryItemSchema.extend({
  day: z.coerce.number({
    required_error: "Day is required",
    invalid_type_error: "Day must be a number",
  }).min(1, "Day must be at least 1").default(1), // Default to day 1
  title: z.string().min(2, "Title must be at least 2 characters"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  startLocation: z.string().min(1, "Start location is required"),
  endLocation: z.string().min(1, "End location is required"),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.string().optional(),
  // This will handle both string (from DB) and array (from form) values
  recurrenceDays: z.union([z.array(z.string()), z.string()]).optional(),
});

type ItineraryFormValues = z.infer<typeof itineraryFormSchema>;

interface ItineraryFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: {
    id?: number;
    day?: number;
    title?: string;
    description?: string | null;
    location?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    isRecurring?: boolean;
    recurrencePattern?: string | null;
    recurrenceDays?: string[] | null;
    fromLocation?: string | null;
    toLocation?: string | null;
  };
}

export function ItineraryForm({ tripId, onSuccess, onCancel, initialData }: ItineraryFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditMode = !!initialData?.id;
  const [showForm, setShowForm] = useState(false);
  
  // Parse recurrenceDays if it's a string
  let parsedRecurrenceDays: string[] = [];
  if (initialData?.recurrenceDays) {
    if (typeof initialData.recurrenceDays === 'string') {
      try {
        parsedRecurrenceDays = JSON.parse(initialData.recurrenceDays);
      } catch (e) {
        console.error('Error parsing recurrenceDays:', e);
      }
    } else if (Array.isArray(initialData.recurrenceDays)) {
      parsedRecurrenceDays = initialData.recurrenceDays;
    }
  }
  
  const [isRecurring, setIsRecurring] = useState(initialData?.isRecurring || false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>(initialData?.recurrencePattern || 'daily');

  // Function to extract coordinates from location string
  const extractCoordinates = (locationStr: string | null | undefined): { lat: number, lng: number } | null => {
    if (!locationStr) return null;
    
    // First try the new format with square brackets [lat, lng]
    let coordsRegex = /\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/;
    let match = locationStr.match(coordsRegex);
    
    // If not found, try the old format with parentheses (lat, lng)
    if (!match) {
      coordsRegex = /\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/;
      match = locationStr.match(coordsRegex);
    }
    
    if (match && match.length === 3) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  };
  
  // Extract coordinates from initial fromLocation/toLocation if available
  const initialStartCoords = extractCoordinates(initialData?.fromLocation) || 
    extractCoordinates(initialData?.location);
  const initialEndCoords = extractCoordinates(initialData?.toLocation);
  
  // Store coordinates, but don't show map UI for editing them
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number, lng: number } | null>(initialStartCoords);
  const [endLocationCoords, setEndLocationCoords] = useState<{ lat: number, lng: number } | null>(initialEndCoords);

  // Form setup
  const form = useForm<ItineraryFormValues>({
    resolver: zodResolver(itineraryFormSchema),
    defaultValues: {
      tripId,
      day: initialData?.day || 1,
      title: initialData?.title || "",
      description: initialData?.description || "",
      startTime: initialData?.startTime || "",
      endTime: initialData?.endTime || "",
      // Use fromLocation/toLocation first, fall back to parsed location value if needed
      startLocation: initialData?.fromLocation || 
        (initialData?.location && initialData.location.includes(" to ") 
          ? initialData.location.split(" to ")[0].trim() 
          : initialData?.location || ""),
      endLocation: initialData?.toLocation || 
        (initialData?.location && initialData.location.includes(" to ") 
          ? initialData.location.split(" to ")[1].trim() 
          : ""),
      isRecurring: initialData?.isRecurring || false,
      recurrencePattern: initialData?.recurrencePattern || "daily",
      recurrenceDays: parsedRecurrenceDays,
      createdBy: user?.id || 0,
    },
  });

  // Create/Update itinerary item mutation
  const mutation = useMutation({
    mutationFn: async (values: ItineraryFormValues) => {
      if (isEditMode && initialData?.id) {
        // Update existing item
        const res = await apiRequest("PATCH", `/api/itinerary/${initialData.id}`, values);
        return await res.json();
      } else {
        // Create new item
        const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary`, values);
        return await res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] });
      toast({
        title: "Success!",
        description: isEditMode 
          ? "Itinerary item has been updated." 
          : "Itinerary item has been added.",
      });
      handleSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${isEditMode ? 'update' : 'add'} itinerary item: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ItineraryFormValues) => {
    // Clean up recurrence data for non-recurring events
    if (!values.isRecurring) {
      values.recurrencePattern = undefined;
      values.recurrenceDays = undefined;
    }
    
    // Verify specific-days has selected days
    if (values.isRecurring && values.recurrencePattern === 'specific-days' && 
        (!values.recurrenceDays || (Array.isArray(values.recurrenceDays) && values.recurrenceDays.length === 0))) {
      toast({
        title: "Error",
        description: "Please select at least one day for your recurring event",
        variant: "destructive",
      });
      return;
    }
    
    // Convert recurrenceDays array to string for storage
    let formValues = {...values};
    if (Array.isArray(values.recurrenceDays) && values.recurrenceDays.length > 0) {
      const recurrenceDaysString = JSON.stringify(values.recurrenceDays);
      formValues = {
        ...formValues,
        recurrenceDays: recurrenceDaysString,
      };
    }
    
    // Map from our form field names to database field names
    const dataToSubmit = {
      ...formValues,
      // Store coordinates with locations, but separate with custom delimiter for easy processing
      fromLocation: startLocationCoords 
        ? `${formValues.startLocation || ''} [${startLocationCoords.lat}, ${startLocationCoords.lng}]`
        : formValues.startLocation,
      toLocation: endLocationCoords 
        ? `${formValues.endLocation || ''} [${endLocationCoords.lat}, ${endLocationCoords.lng}]` 
        : formValues.endLocation,
      // Set location to combined value for backwards compatibility
      location: `${formValues.startLocation || ''} to ${formValues.endLocation || ''}`.trim(),
    };
    
    // Delete form-specific fields that don't exist in the schema
    delete (dataToSubmit as any).startLocation;
    delete (dataToSubmit as any).endLocation;
    
    // Submit the form
    mutation.mutate(dataToSubmit as any);
  };

  const handleCancel = () => {
    setShowForm(false);
    onCancel();
  };

  const handleSuccess = () => {
    setShowForm(false);
    onSuccess();
  };
  
  // If the form isn't shown, just display the button to add an itinerary item
  if (!showForm) {
    return (
      <Button
        size="sm"
        onClick={() => setShowForm(true)}
      >
        {isEditMode ? "Edit Itinerary Item" : "Add Itinerary Item"}
      </Button>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Activity Title - Moved to top */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-lg font-semibold">Activity Title</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Visit the Eiffel Tower" 
                  className="text-lg" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Time Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <div className="px-3 py-2 bg-muted text-muted-foreground">
                      <Clock className="h-4 w-4" />
                    </div>
                    <Input 
                      type="time"
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
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
                <FormLabel>End Time</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <div className="px-3 py-2 bg-muted text-muted-foreground">
                      <Clock className="h-4 w-4" />
                    </div>
                    <Input 
                      type="time"
                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Recurring Activity Settings */}
        <div className="border p-4 rounded-md bg-slate-50">
          <div className="flex items-center space-x-2 mb-4">
            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Switch 
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        setIsRecurring(checked);
                        if (!checked) {
                          form.setValue('recurrencePattern', 'daily');
                          form.setValue('recurrenceDays', []);
                        }
                      }}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-medium">
                    This is a recurring activity
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>

          {isRecurring && (
            <div className="space-y-4 mt-2">
              <FormField
                control={form.control}
                name="recurrencePattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence Pattern</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        setRecurrencePattern(value);
                      }}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a pattern" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {recurrencePatterns.map((pattern) => (
                          <SelectItem key={pattern.value} value={pattern.value}>
                            {pattern.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {recurrencePattern === 'specific-days' && (
                <FormField
                  control={form.control}
                  name="recurrenceDays"
                  render={() => (
                    <FormItem>
                      <div className="mb-2">
                        <FormLabel>Select Days</FormLabel>
                        <FormDescription>Choose the days this event repeats</FormDescription>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {weekdays.map((day) => (
                          <FormField
                            key={day.value}
                            control={form.control}
                            name="recurrenceDays"
                            render={({ field }) => {
                              // Convert field value to array if it's a string or undefined
                              const fieldValues = Array.isArray(field.value) 
                                ? field.value 
                                : (field.value ? [field.value] : []);
                                
                              return (
                                <FormItem
                                  key={day.value}
                                  className="flex flex-row items-center space-x-2 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={fieldValues.includes(day.value)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...fieldValues, day.value])
                                          : field.onChange(
                                              fieldValues.filter(
                                                (value) => value !== day.value
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
        </div>
        
        {/* Location fields and Description */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-blue-600" />
                    Start Location
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Where this activity starts" 
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      className={cn(
                        startLocationCoords && "border-green-500"
                      )}
                    />
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
                  <FormLabel className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-blue-600" />
                    End Location
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Where this activity ends" 
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      className={cn(
                        endLocationCoords && "border-green-500"
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          {/* Location clearing buttons */}
          <div className="flex justify-end space-x-2">
            {startLocationCoords && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="text-xs"
                onClick={() => {
                  setStartLocationCoords(null);
                  // Just remove the coordinates part from the location field if it exists
                  const currentLocation = form.getValues("startLocation") || "";
                  // Check for both bracket formats
                  if (currentLocation.includes("[") || currentLocation.includes("(")) {
                    const indexToUse = currentLocation.includes("[") 
                      ? currentLocation.lastIndexOf("[") 
                      : currentLocation.lastIndexOf("(");
                      
                    form.setValue("startLocation", currentLocation.substring(0, indexToUse).trim());
                    
                    toast({
                      title: "Coordinates cleared",
                      description: "Start location coordinates have been removed",
                      duration: 3000,
                    });
                  }
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear Start Coordinates
              </Button>
            )}
            {endLocationCoords && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="text-xs"
                onClick={() => {
                  setEndLocationCoords(null);
                  // Just remove the coordinates part from the location field if it exists
                  const currentLocation = form.getValues("endLocation") || "";
                  // Check for both bracket formats
                  if (currentLocation.includes("[") || currentLocation.includes("(")) {
                    const indexToUse = currentLocation.includes("[") 
                      ? currentLocation.lastIndexOf("[") 
                      : currentLocation.lastIndexOf("(");
                      
                    form.setValue("endLocation", currentLocation.substring(0, indexToUse).trim());
                    
                    toast({
                      title: "Coordinates cleared",
                      description: "End location coordinates have been removed",
                      duration: 3000,
                    });
                  }
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear End Coordinates
              </Button>
            )}
          </div>
          
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="mt-3">
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Additional details about this activity" 
                    className="resize-none h-24"
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
          
        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={mutation.isPending}
          >
            {mutation.isPending 
              ? (isEditMode ? "Updating..." : "Adding...") 
              : (isEditMode ? "Update Item" : "Add Item")}
          </Button>
        </div>
      </form>
    </Form>
  );
}