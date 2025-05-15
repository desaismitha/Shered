import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMessageSchema, InsertMessage } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, MicIcon, PaperclipIcon, SendIcon, SmileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Dynamically adjust the input field height as content grows
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

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
      setIsExpanded(false);
      // Focus the input field after sending a message
      if (inputRef.current) {
        inputRef.current.focus();
      }
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
    if (!values.content.trim()) return;
    mutation.mutate(values);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.handleSubmit(onSubmit)();
    }
  };

  // Handle input focus to show/hide additional options
  const handleFocus = () => setIsExpanded(true);
  const handleBlur = (e: React.FocusEvent) => {
    // Don't collapse if clicking another element in the form
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    // If there's content, don't collapse
    if (form.getValues("content")?.trim()) {
      return;
    }
    setIsExpanded(false);
  };

  const showFutureFeature = (featureName: string) => {
    toast({
      title: `${featureName} Coming Soon`,
      description: `The ${featureName.toLowerCase()} feature will be available in a future update.`,
    });
  };

  return (
    <Form {...form}>
      <form 
        onSubmit={form.handleSubmit(onSubmit)} 
        className="relative border-t border-gray-200 pt-3 px-2"
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {/* Media attachment options - only visible when expanded */}
        {isExpanded && (
          <div className="flex justify-between mb-2 px-1">
            <div className="flex space-x-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full text-gray-500 hover:text-primary-600 hover:bg-primary-50"
                      onClick={() => showFutureFeature("Photo Sharing")}
                    >
                      <ImageIcon className="h-4 w-4" />
                      <span className="sr-only">Add Photo</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Share Photo</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full text-gray-500 hover:text-primary-600 hover:bg-primary-50"
                      onClick={() => showFutureFeature("File Attachment")}
                    >
                      <PaperclipIcon className="h-4 w-4" />
                      <span className="sr-only">Attach File</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Attach File</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
        
        <div className="flex items-end space-x-2 bg-white rounded-2xl border border-gray-200 px-3 py-2">
          {/* Emoji button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full text-gray-500 hover:text-primary-600 hover:bg-primary-50 flex-shrink-0"
                  onClick={() => showFutureFeature("Emoji Picker")}
                >
                  <SmileIcon className="h-5 w-5" />
                  <span className="sr-only">Add Emoji</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Add Emoji</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Input field */}
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input 
                    placeholder="Type a message..." 
                    {...field} 
                    onKeyDown={handleKeyDown}
                    disabled={mutation.isPending}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-1 min-h-[40px] text-sm"
                    ref={inputRef}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          
          {/* Send button */}
          <Button 
            type="submit" 
            size="icon"
            variant="ghost"
            disabled={mutation.isPending || !form.getValues("content")?.trim()}
            className={`h-9 w-9 rounded-full flex-shrink-0 ${
              form.getValues("content")?.trim() 
                ? 'bg-primary-600 text-white hover:bg-primary-700' 
                : 'text-gray-400'
            }`}
          >
            <SendIcon className="h-5 w-5" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </Form>
  );
}
