import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Schema for the modification request form
const modificationRequestSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  startLocation: z.string().optional(),
  destination: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

type ModificationRequestData = z.infer<typeof modificationRequestSchema>;

interface RequestModificationDialogProps {
  tripId: number;
  tripName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RequestModificationDialog({
  tripId,
  tripName,
  isOpen,
  onClose,
  onSuccess,
}: RequestModificationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize the form
  const form = useForm<ModificationRequestData>({
    resolver: zodResolver(modificationRequestSchema),
    defaultValues: {
      name: "",
      description: "",
      startLocation: "",
      destination: "",
      startDate: "",
      endDate: "",
      notes: "",
    },
  });

  // Mutation for submitting the modification request
  const requestModification = useMutation({
    mutationFn: async (data: ModificationRequestData) => {
      // Filter out empty fields to only send fields that have values
      const changes: Record<string, any> = {};
      Object.entries(data).forEach(([key, value]) => {
        // Skip the notes field as it's not part of the changes
        if (key !== "notes" && value && value.trim() !== "") {
          changes[key] = value;
        }
      });

      // Prepare the request payload
      const payload = {
        changes,
        notes: data.notes,
      };

      const res = await apiRequest(
        "POST",
        `/api/trips/${tripId}/request-modification`,
        payload
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Modification Request Submitted",
        description: "Your request has been submitted for admin approval.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/modification-requests`] });
      form.reset();
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit request",
        description: error.message || "There was an error submitting your request.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: ModificationRequestData) => {
    // Check if any changes were specified
    const hasChanges = Object.entries(data).some(
      ([key, value]) => key !== "notes" && value && value.trim() !== ""
    );

    if (!hasChanges) {
      toast({
        title: "No changes specified",
        description: "Please specify at least one change to request.",
        variant: "destructive",
      });
      return;
    }

    requestModification.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Request Schedule Modification</DialogTitle>
          <DialogDescription>
            Submit a request to modify "{tripName}". An administrator will review your request.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Schedule Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter new name" {...field} />
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
                  <FormLabel>New Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter new description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="startLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Start Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter new start location" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Destination</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter new destination" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Start Date/Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New End Date/Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes for Admin</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes explaining your change request"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={requestModification.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={requestModification.isPending}
              >
                {requestModification.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}