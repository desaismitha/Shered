import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMessageSchema, InsertMessage } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// Create a message schema for the form
const messageFormSchema = insertMessageSchema.extend({
  content: z.string().min(1, "Message cannot be empty"),
});

type MessageFormValues = z.infer<typeof messageFormSchema>;

interface MessageFormProps {
  groupId: number;
}

export function MessageForm({ groupId }: MessageFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Form setup
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      groupId,
      userId: user?.id || 0,
      content: "",
    },
  });

  // Send message mutation
  const mutation = useMutation({
    mutationFn: async (values: MessageFormValues) => {
      const res = await apiRequest("POST", `/api/groups/${groupId}/messages`, values);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "messages"] });
      form.reset({ 
        groupId, 
        userId: user?.id || 0,
        content: "" 
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to send message: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: MessageFormValues) => {
    mutation.mutate(values);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.handleSubmit(onSubmit)();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex space-x-2">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input 
                    placeholder="Type your message..." 
                    {...field} 
                    onKeyDown={handleKeyDown}
                    disabled={mutation.isPending}
                    className="w-full"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          
          <Button 
            type="submit" 
            size="icon"
            disabled={mutation.isPending}
          >
            <SendIcon className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </Form>
  );
}
