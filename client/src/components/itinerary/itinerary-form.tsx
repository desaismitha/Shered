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
import { ArrowRightIcon } from "lucide-react";

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
  }).min(1, "Day must be at least 1"),
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

export function ItineraryForm({ tripId, onSuccess, onCancel }: ItineraryFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>('daily');

  // Form setup
  const form = useForm<ItineraryFormValues>({
    resolver: zodResolver(itineraryFormSchema),
    defaultValues: {
      tripId,
      day: 1,
      title: "",
      description: "",
      location: "",
      startTime: "",
      endTime: "",
      isRecurring: false,
      recurrencePattern: "daily",
      recurrenceDays: [],
      createdBy: user?.id || 0,
    },
  });

  // Create itinerary item mutation
  const mutation = useMutation({
    mutationFn: async (values: ItineraryFormValues) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary`, values);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "itinerary"] });
      toast({
        title: "Success!",
        description: "Itinerary item has been added.",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add itinerary item: ${error.message}`,
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
        (!values.recurrenceDays || values.recurrenceDays.length === 0)) {
      toast({
        title: "Error",
        description: "Please select at least one day for your recurring event",
        variant: "destructive",
      });
      return;
    }
    
    // Convert recurrenceDays array to string for storage
    let formValues = {...values};
    if (values.recurrenceDays && values.recurrenceDays.length > 0) {
      const recurrenceDaysString = JSON.stringify(values.recurrenceDays);
      formValues = {
        ...formValues,
        recurrenceDays: recurrenceDaysString,
      };
    }
    
    // Submit the form
    mutation.mutate(formValues as any);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Day and Time Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="day"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Day</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="1" 
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time (optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="time"
                    {...field}
                  />
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
                <FormLabel>End Time (optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="time"
                    {...field}
                  />
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
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                        {weekdays.map((day) => (
                          <FormField
                            key={day.value}
                            control={form.control}
                            name="recurrenceDays"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={day.value}
                                  className="flex flex-row items-center space-x-2 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(day.value)}
                                      onCheckedChange={(checked) => {
                                        const currentValues = field.value || [];
                                        return checked
                                          ? field.onChange([...currentValues, day.value])
                                          : field.onChange(
                                              currentValues.filter(
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

        {/* Activity Details */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Activity Title</FormLabel>
              <FormControl>
                <Input placeholder="Visit the Eiffel Tower" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Champ de Mars, Paris" {...field} />
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
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Notes about this activity" 
                  className="resize-none" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Adding..." : "Add Item"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
