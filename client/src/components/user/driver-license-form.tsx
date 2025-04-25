import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Form schema for driver license information
const driverLicenseSchema = z.object({
  licenseNumber: z.string().min(1, "License number is required"),
  licenseState: z.string().min(1, "State is required"),
  licenseExpiry: z.date({
    required_error: "License expiry date is required",
  }),
  isEligibleDriver: z.boolean().default(true),
});

type DriverLicenseFormValues = z.infer<typeof driverLicenseSchema>;

interface DriverLicenseFormProps {
  userId: number;
  currentData?: {
    licenseNumber?: string;
    licenseState?: string;
    licenseExpiry?: Date | null;
    isEligibleDriver?: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DriverLicenseForm({ userId, currentData, onSuccess, onCancel }: DriverLicenseFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = !!currentData?.licenseNumber;

  // Initialize form with default values or current data if available
  const form = useForm<DriverLicenseFormValues>({
    resolver: zodResolver(driverLicenseSchema),
    defaultValues: {
      licenseNumber: currentData?.licenseNumber || "",
      licenseState: currentData?.licenseState || "",
      licenseExpiry: currentData?.licenseExpiry ? new Date(currentData.licenseExpiry) : new Date(),
      isEligibleDriver: currentData?.isEligibleDriver !== undefined ? currentData.isEligibleDriver : true,
    },
  });

  // Mutation for updating driver license info
  const mutation = useMutation({
    mutationFn: async (values: DriverLicenseFormValues) => {
      const res = await apiRequest("PUT", `/api/users/${userId}/license`, values);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      
      toast({
        title: "License information updated",
        description: "Your driver license information has been saved successfully.",
      });
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  function onSubmit(values: DriverLicenseFormValues) {
    mutation.mutate(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="licenseNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License Number*</FormLabel>
                <FormControl>
                  <Input placeholder="Enter your license number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="licenseState"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State/Province*</FormLabel>
                <FormControl>
                  <Input placeholder="State or province of issue" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="licenseExpiry"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Expiration Date*</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
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
                    disabled={(date) =>
                      date < new Date() // Can't select dates in the past
                    }
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
          name="isEligibleDriver"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>I am eligible to drive during this trip</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Check this box if you're willing and eligible to be assigned as a driver
                </p>
              </div>
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2">
          {onCancel && (
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button 
            type="submit" 
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : (isEditing ? "Update License Info" : "Save License Info")}
          </Button>
        </div>
      </form>
    </Form>
  );
}