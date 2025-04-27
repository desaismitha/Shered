import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertItineraryItemSchema, InsertItineraryItem } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";

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
  ArrowRightIcon, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Navigation,
  X
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, normalizeDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

  // Form setup
  const form = useForm<ItineraryFormValues>({
    resolver: zodResolver(itineraryFormSchema),
    defaultValues: {
      tripId,
      day: initialData?.day || 1,
      title: initialData?.title || "",
      description: initialData?.description || "",
      location: initialData?.location || "",
      startTime: initialData?.startTime || "",
      endTime: initialData?.endTime || "",
      isRecurring: initialData?.isRecurring || false,
      recurrencePattern: initialData?.recurrencePattern || "daily",
      recurrenceDays: parsedRecurrenceDays,
      fromLocation: initialData?.fromLocation || "",
      toLocation: initialData?.toLocation || "",
      createdBy: user?.id || 0,
    },
  });

  // State for map location selection
  const [locationCoords, setLocationCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [transportFromCoords, setTransportFromCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [transportToCoords, setTransportToCoords] = useState<{ lat: number, lng: number } | null>(null);
  
  // Map refs for different maps
  const locationMapRef = useRef<L.Map | null>(null);
  const transportMapRef = useRef<L.Map | null>(null);
  
  // State to track which map is active for picking locations
  const [activeMapPicker, setActiveMapPicker] = useState<'location' | 'transport-from' | 'transport-to' | null>(null);

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
    
    // Submit the form
    mutation.mutate(formValues as any);
  };

  const handleCancel = () => {
    setShowForm(false);
    onCancel();
  };

  const handleSuccess = () => {
    setShowForm(false);
    onSuccess();
  };
  
  // Function to handle location selection on map
  interface LocationPickerProps {
    setCoords: (coords: { lat: number, lng: number }) => void;
  }
  
  function LocationPicker({ setCoords }: LocationPickerProps) {
    const map = useMapEvents({
      click(e) {
        setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    
    return null;
  }
  
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

        {/* Location with Map Selection */}
        <div className="border p-4 rounded-md">
          <h3 className="font-medium text-lg mb-3">Location Details</h3>
          
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Location</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input 
                        placeholder="e.g., Eiffel Tower, Paris" 
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className={cn(
                          locationCoords && "border-green-500 focus-visible:ring-green-500"
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "flex items-center",
                        activeMapPicker === 'location' && "bg-primary text-primary-foreground"
                      )}
                      onClick={() => setActiveMapPicker(activeMapPicker === 'location' ? null : 'location')}
                    >
                      <MapPin className="h-4 w-4 mr-1" />
                      {activeMapPicker === 'location' ? 'Hide Map' : 'Pick on Map'}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {activeMapPicker === 'location' && (
            <div className="mt-3 h-[300px] border rounded overflow-hidden">
              {typeof window !== 'undefined' && (
                <MapContainer
                  center={locationCoords ? [locationCoords.lat, locationCoords.lng] : [40.7128, -74.006]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  ref={(map) => {
                    if (map) {
                      locationMapRef.current = map;
                    }
                  }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  <LocationPicker setCoords={setLocationCoords} />
                  
                  {locationCoords && (
                    <Marker 
                      position={[locationCoords.lat, locationCoords.lng]} 
                    >
                      <Popup>
                        Selected location for: {form.getValues('title')}
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              )}
              <div className="bg-muted p-2 text-xs">
                Click on the map to select a precise location
              </div>
            </div>
          )}
          
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
        
        {/* Transportation details with Map Integration */}
        <div className="border p-4 rounded-md bg-blue-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-lg text-blue-900">Transportation Details</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "flex items-center text-blue-700 border-blue-300",
                activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to' 
                  ? "bg-blue-600 text-white hover:text-white hover:bg-blue-700" 
                  : "bg-blue-50"
              )}
              onClick={() => setActiveMapPicker(
                activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to' 
                  ? null 
                  : 'transport-from'
              )}
            >
              <MapPin className="h-4 w-4 mr-1" />
              {activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to' 
                ? 'Hide Map' 
                : 'Use Map'}
            </Button>
          </div>
          
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="fromLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-blue-600" />
                    Starting Location
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input 
                        placeholder="Where the trip segment starts" 
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className={cn(
                          transportFromCoords && "border-green-500"
                        )}
                      />
                      {(activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-10 border-blue-300",
                            activeMapPicker === 'transport-from' && "bg-blue-600 text-white"
                          )}
                          onClick={() => setActiveMapPicker('transport-from')}
                        >
                          {activeMapPicker === 'transport-from' ? 'Picking...' : 'Pick'}
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="toLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-blue-600" />
                    Destination Location
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input 
                        placeholder="Where the trip segment ends" 
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className={cn(
                          transportToCoords && "border-green-500"
                        )}
                      />
                      {(activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-10 border-blue-300",
                            activeMapPicker === 'transport-to' && "bg-blue-600 text-white"
                          )}
                          onClick={() => setActiveMapPicker('transport-to')}
                        >
                          {activeMapPicker === 'transport-to' ? 'Picking...' : 'Pick'}
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {(activeMapPicker === 'transport-from' || activeMapPicker === 'transport-to') && (
              <div className="mt-3 h-[300px] border rounded overflow-hidden">
                {typeof window !== 'undefined' && (
                  <MapContainer
                    center={transportFromCoords || transportToCoords
                      ? [
                          transportFromCoords?.lat || transportToCoords?.lat || 40.7128, 
                          transportFromCoords?.lng || transportToCoords?.lng || -74.006
                        ]
                      : [40.7128, -74.006]
                    }
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                    ref={(map) => {
                      if (map) {
                        transportMapRef.current = map;
                      }
                    }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    <LocationPicker 
                      setCoords={activeMapPicker === 'transport-from' 
                        ? setTransportFromCoords 
                        : setTransportToCoords
                      } 
                    />
                    
                    {transportFromCoords && (
                      <Marker 
                        position={[transportFromCoords.lat, transportFromCoords.lng]}
                      >
                        <Popup>
                          Starting point
                        </Popup>
                      </Marker>
                    )}
                    
                    {transportToCoords && (
                      <Marker 
                        position={[transportToCoords.lat, transportToCoords.lng]}
                      >
                        <Popup>
                          Destination
                        </Popup>
                      </Marker>
                    )}
                  </MapContainer>
                )}
                <div className="bg-blue-100 p-2 text-xs flex justify-between items-center">
                  <span>
                    Click on the map to select {activeMapPicker === 'transport-from' ? 'starting point' : 'destination'}
                  </span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => {
                      if (activeMapPicker === 'transport-from') {
                        setTransportFromCoords(null);
                      } else {
                        setTransportToCoords(null);
                      }
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
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