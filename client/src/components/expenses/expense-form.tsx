import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, InsertExpense, GroupMember, User } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
import { Calendar as CalendarIcon } from "lucide-react";

// Extend the expense schema for the form
const expenseFormSchema = insertExpenseSchema
  .extend({
    date: z.coerce.date({
      required_error: "Date is required",
    }),
    amount: z.coerce.number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    }).min(0, "Amount must be positive"),
    splitAmong: z.array(z.number()).min(1, "Select at least one person"),
  })
  .omit({ id: true, createdAt: true });

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormProps {
  tripId: number;
  groupMembers: GroupMember[];
  users: User[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExpenseForm({ tripId, groupMembers, users, onSuccess, onCancel }: ExpenseFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();

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
      splitAmong: groupMembers.map(member => member.userId),
      date: new Date(),
      category: "Other",
    },
  });

  // Create expense mutation
  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      // Convert amount to cents
      const amountInCents = Math.round(values.amount * 100);
      const expenseData = {
        ...values,
        amount: amountInCents,
      };
      
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
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add expense: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    mutation.mutate(values);
  };

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
                defaultValue={field.value.toString()}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select who paid" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {groupMembers.map(member => {
                    const memberUser = users.find(u => u.id === member.userId);
                    return (
                      <SelectItem key={member.userId} value={member.userId.toString()}>
                        {memberUser?.displayName || memberUser?.username || "Unknown User"}
                      </SelectItem>
                    );
                  })}
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
              <div className="space-y-2">
                {groupMembers.map(member => {
                  const memberUser = users.find(u => u.id === member.userId);
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
                                {memberUser?.displayName || memberUser?.username || "Unknown User"}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    </div>
                  );
                })}
                <FormMessage />
              </div>
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
            {mutation.isPending ? "Adding..." : "Add Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
