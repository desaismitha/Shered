import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Message, User } from "@shared/schema";
import { format, isToday, isYesterday } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { CheckCheck, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageListProps {
  groupId: number;
  users: User[];
}

export function MessageList({ groupId, users = [] }: MessageListProps) {
  const { user: currentUser } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  // Get all users if none provided
  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: users.length === 0,
  });
  
  // Use provided users or fetched users
  const usersList = users.length > 0 ? users : (allUsers || []);
  
  // Fetch messages
  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/groups", groupId, "messages"],
    refetchInterval: 2000, // Poll for new messages every 2 seconds
  });
  
  // Debug - log the messages we received
  useEffect(() => {
    if (messages) {
      console.log("Received messages:", messages);
    }
  }, [messages]);
  
  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages?.length && !initialScrollDone) {
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        setInitialScrollDone(true);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, initialScrollDone]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (initialScrollDone && messages?.length) {
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, initialScrollDone]);
  
  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`flex items-start space-x-3 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            {i % 2 === 0 && <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />}
            <div className="flex-1 max-w-[75%]">
              {i % 2 === 0 && <Skeleton className="h-4 w-24 mb-1" />}
              <Skeleton className={`h-16 w-full rounded-lg ${i % 2 === 0 ? 'rounded-tl-none' : 'rounded-tr-none ml-auto'}`} />
              <Skeleton className="h-3 w-16 mt-1 ml-auto" />
            </div>
            {i % 2 !== 0 && <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />}
          </div>
        ))}
      </div>
    );
  }
  
  // Empty state
  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <div className="bg-primary-50 p-6 rounded-full mb-4">
          <MessageSquare className="h-12 w-12 text-primary-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 mb-1">No messages yet</h3>
        <p className="text-neutral-500 max-w-sm">
          Start the conversation by sending a message to your travel group.
        </p>
      </div>
    );
  }
  
  // Group messages by date
  const messagesByDate: Record<string, Message[]> = {};
  messages.forEach(message => {
    const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
    const dateKey = format(createdAt, 'yyyy-MM-dd');
    if (!messagesByDate[dateKey]) {
      messagesByDate[dateKey] = [];
    }
    messagesByDate[dateKey].push(message);
  });
  
  // Helper functions
  const getUserInitials = (name: string): string => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };
  
  const getFriendlyDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return "Today";
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, 'MMMM d, yyyy');
    }
  };
  
  const shouldShowSender = (messages: Message[], index: number, userId: number): boolean => {
    if (index === 0) return true; // Always show for first message
    const prevMessage = messages[index - 1];
    return prevMessage.userId !== userId; // Show if previous message was from a different user
  };
  
  const getMessageSender = (userId: number): string => {
    if (userId === currentUser?.id) return "You";
    const sender = usersList.find(u => u.id === userId);
    return sender?.displayName || sender?.username || "Unknown User";
  };
  
  return (
    <div className="flex flex-col space-y-5 p-4 overflow-y-auto h-full bg-gray-50 rounded-lg">
      {Object.entries(messagesByDate).map(([dateKey, dateMessages]) => (
        <div key={dateKey} className="space-y-4">
          <div className="text-center mb-6">
            <div className="inline-block bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs font-medium">
              {getFriendlyDate(dateKey)}
            </div>
          </div>
          
          <div className="space-y-3">
            {dateMessages.map((message, index) => {
              const isCurrentUser = message.userId === currentUser?.id;
              const messageDate = message.createdAt ? new Date(message.createdAt) : new Date();
              const showSender = shouldShowSender(dateMessages, index, message.userId);
              const sender = getMessageSender(message.userId);
              const userInitials = getUserInitials(sender);
              
              // Simple message display for debugging
              return (
                <div key={message.id} className="relative p-3 border rounded-lg mb-2 bg-white">
                  <div className="font-medium">{sender}</div>
                  <div className="mt-1">{message.content}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    {format(messageDate, 'h:mm a, MMM d')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {/* Invisible div to enable scrolling to bottom */}
      <div ref={messagesEndRef} />
    </div>
  );
}