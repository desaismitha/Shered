import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, InsertExpense, GroupMember, User, Trip as BaseTrip } from "@shared/schema";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

// Extend the Trip type to include the _accessLevel property
interface Trip extends BaseTrip {
  _accessLevel?: 'owner' | 'member' | null;
}

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";

// Extend the expense schema for the form
const expenseFormSchema = z.object({
  tripId: z.number(),
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).min(0, "Amount must be positive"),
  paidBy: z.number(),
  splitAmong: z.array(z.number()).min(1, "Select at least one person"),
  date: z.coerce.date({
    required_error: "Date is required",
  }),
  category: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormProps {
  tripId: number;
  groupMembers: GroupMember[];
  users: User[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExpenseForm({ tripId, groupMembers: initialGroupMembers, users: initialUsers, onSuccess, onCancel }: ExpenseFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  // Get trip details to get the groupId
  const { data: trip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });
  
  // Get all users for expense details
  const { data: allUsers, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: showForm,
  });

  // Extract group ID from trip data safely
  const tripGroupId = trip && 'groupId' in trip ? trip.groupId : 0;
  
  // Get group members directly from the API if the group exists
  const { data: fetchedGroupMembers, isLoading: isLoadingGroupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", tripGroupId, "members"],
    enabled: showForm && !!tripGroupId,
  });

  // Combine the fetched and initially provided data
  const users = allUsers || initialUsers || [];
  const groupMembers = fetchedGroupMembers || initialGroupMembers || [];
  
  // Add the current user to the list if they're not in the group members
  const effectiveGroupMembers = groupMembers.length > 0 ? 
    groupMembers : 
    [{ id: 1, groupId: tripGroupId, userId: user?.id || 0, role: "member" } as GroupMember];

  // Create the expense categories
  const expenseCategories = [
    "Accommodation",
    "Transportation",
    "Food",
    "Activities",
    "Shopping",
    "Other"
  ];

  // Form setup
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      tripId,
      title: "",
      amount: 0,
      paidBy: user?.id || 0,
      splitAmong: [],
      date: new Date(),
      category: "Other",
    },
  });

  // Update the splitAmong field when group members change
  useEffect(() => {
    if (effectiveGroupMembers.length > 0) {
      const memberIds = effectiveGroupMembers.map(member => member.userId);
      console.log("Setting splitAmong with member IDs:", memberIds);
      form.setValue('splitAmong', memberIds);
    }
  }, [form, effectiveGroupMembers]);

  // Create expense mutation
  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      // Convert amount to cents
      const amountInCents = Math.round(values.amount * 100);
      const expenseData = {
        ...values,
        amount: amountInCents,
      };
      
      console.log("Submitting expense:", expenseData);
      const res = await apiRequest("POST", `/api/trips/${tripId}/expenses`, expenseData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({
        title: "Success!",
        description: "Your expense has been added.",
      });
      handleSuccess();
    },
    onError: (error) => {
      console.error("Error adding expense:", error);
      toast({
        title: "Error",
        description: `Failed to add expense: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    // Format the date as an ISO string to ensure consistent date handling
    const formattedValues = {
      ...values,
      date: values.date.toISOString()
    };
    
    console.log("Submitting expense with formatted values:", formattedValues);
    mutation.mutate(formattedValues as any);
  };

  const handleCancel = () => {
    setShowForm(false);
    onCancel();
  };

  const handleSuccess = () => {
    setShowForm(false);
    onSuccess();
  };

  // If the form isn't shown, just display the button to add an expense
  if (!showForm) {
    return (
      <Button 
        size="sm"
        onClick={() => setShowForm(true)}
      >
        Add Expense
      </Button>
    );
  }

  const isLoading = isLoadingUsers || isLoadingGroupMembers;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expense Title</FormLabel>
              <FormControl>
                <Input placeholder="Dinner at Restaurant" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ($)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00" 
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
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
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {expenseCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="paidBy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Paid By</FormLabel>
              <Select 
                onValueChange={(value) => field.onChange(parseInt(value))} 
                defaultValue={String(user?.id || 0)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select who paid" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Loading members...</span>
                    </div>
                  ) : effectiveGroupMembers.length > 0 ? (
                    effectiveGroupMembers.map(member => {
                      const memberUser = users.find(u => u.id === member.userId) || { id: member.userId, displayName: null, username: "User" };
                      return (
                        <SelectItem key={member.userId} value={member.userId.toString()}>
                          {memberUser?.displayName || memberUser?.username || `User ${member.userId}`}
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem value={String(user?.id || 0)}>
                      {user?.displayName || user?.username || "You"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="splitAmong"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel>Split Among</FormLabel>
              </div>
              {isLoading ? (
                <div className="flex items-center p-4 border rounded-md text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading group members...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {effectiveGroupMembers.length > 0 ? (
                    effectiveGroupMembers.map(member => {
                      const memberUser = users.find(u => u.id === member.userId) || { id: member.userId, displayName: null, username: "User" };
                      return (
                        <div key={member.userId} className="flex items-center space-x-2">
                          <FormField
                            control={form.control}
                            name="splitAmong"
                            render={({ field }) => {
                              return (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(member.userId)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, member.userId])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== member.userId
                                              )
                                            );
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal">
                                    {memberUser?.displayName || memberUser?.username || `User ${member.userId}`}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 border rounded-md text-muted-foreground">
                      No group members found. The expense will be assigned to you.
                    </div>
                  )}
                  <FormMessage />
                </div>
              )}
            </FormItem>
          )}
        />

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
            disabled={mutation.isPending || isLoading}
          >
            {mutation.isPending ? "Adding..." : "Add Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
