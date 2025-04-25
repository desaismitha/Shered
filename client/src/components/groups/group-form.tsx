import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertGroupSchema, InsertGroup } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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
import { Button } from "@/components/ui/button";

const groupSchema = insertGroupSchema.extend({
  name: z.string().min(3, "Group name must be at least 3 characters"),
});

type GroupFormValues = z.infer<typeof groupSchema>;

export function GroupForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Form
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Create group mutation
  const mutation = useMutation({
    mutationFn: async (values: GroupFormValues) => {
      console.log("Making API request to create group:", values);
      try {
        const res = await apiRequest("POST", "/api/groups", values);
        const jsonResponse = await res.json();
        console.log("API response:", jsonResponse);
        return jsonResponse;
      } catch (error) {
        console.error("API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Group created successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success!",
        description: "Your group has been created.",
      });
      navigate(`/groups/${data.id}`);
    },
    onError: (error) => {
      console.error("Group creation error:", error);
      toast({
        title: "Error",
        description: `Failed to create group: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Submit handler
  const onSubmit = (values: GroupFormValues) => {
    console.log("Form submitted with values:", values);
    
    if (!user) {
      console.error("User is not authenticated");
      return;
    }
    
    // Add createdBy
    const createGroup: InsertGroup = {
      ...values,
      createdBy: user.id,
    };
    
    console.log("Submitting group creation:", createGroup);
    mutation.mutate(createGroup);
  };

  // Function to manually handle form submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Manual form submission triggered");
    
    // Validate form
    const result = form.handleSubmit(onSubmit)();
    console.log("Form validation result:", result);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={handleManualSubmit} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group Name</FormLabel>
              <FormControl>
                <Input placeholder="Beach Lovers" {...field} />
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
                  placeholder="Tell us about your group" 
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
            onClick={() => navigate("/groups")}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={mutation.isPending}
            onClick={() => console.log("Create Group button clicked")}
          >
            {mutation.isPending ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
