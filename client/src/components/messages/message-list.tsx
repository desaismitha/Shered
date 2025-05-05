import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Message, User } from "@shared/schema";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface MessageListProps {
  groupId: number;
  users: User[];
}

export function MessageList({ groupId, users }: MessageListProps) {
  const { user: currentUser } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/groups", groupId, "messages"],
    refetchInterval: 2000, // Poll for new messages every 2 seconds for more responsiveness
    onSuccess: (data) => {
      console.log('Messages received:', data?.length || 0, 'messages');
      // Check that message content is being received properly
      if (data && data.length > 0) {
        console.log('First message content:', data[0].content);
      }
    },
  });
  
  // Initial scroll to bottom when messages first load
  useEffect(() => {
    if (messages?.length && !initialScrollDone) {
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        console.log("Initial scroll to bottom, messages count:", messages.length);
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
        console.log("New message scroll, messages count:", messages.length);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, initialScrollDone]);
  
  if (isLoading) {
    return (
      <div className="space-y-4 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-start space-x-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <MessageSquare className="h-12 w-12 text-neutral-300 mb-3" />
        <h3 className="text-lg font-medium text-neutral-700 mb-1">No messages yet</h3>
        <p className="text-neutral-500">Start the conversation by sending a message.</p>
      </div>
    );
  }
  
  // Group messages by date
  const messagesByDate: Record<string, Message[]> = {};
  messages.forEach(message => {
    const dateKey = format(new Date(message.createdAt), 'yyyy-MM-dd');
    if (!messagesByDate[dateKey]) {
      messagesByDate[dateKey] = [];
    }
    messagesByDate[dateKey].push(message);
  });
  
  console.log("Rendering messages list with", messages?.length || 0, "messages");
  return (
    <div className="space-y-6 p-2 overflow-y-auto h-full">
      {Object.entries(messagesByDate).map(([dateKey, dateMessages]) => (
        <div key={dateKey}>
          <div className="text-center mb-4">
            <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full">
              {format(new Date(dateKey), 'MMMM d, yyyy')}
            </span>
          </div>
          
          <div className="space-y-4">
            {dateMessages.map(message => {
              const messageUser = users.find(u => u.id === message.userId);
              const isCurrentUser = message.userId === currentUser?.id;
              const messageDate = message.createdAt ? new Date(message.createdAt) : new Date();
              
              return (
                <div 
                  key={message.id} 
                  className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3`}
                >
                  <div className="flex items-start max-w-[80%] gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-base font-semibold">
                        {isCurrentUser ? 'Y' : 'U'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col space-y-1">
                      <p className="text-xs font-medium text-primary-600">
                        {isCurrentUser ? 'You' : (messageUser?.displayName || messageUser?.username || "Unknown User")}
                      </p>
                      
                      <div className="bg-primary-600 text-white rounded-lg px-3 py-2 text-sm rounded-tl-none">
                        <span>{message.content}</span>
                      </div>
                      
                      <p className="text-xs text-neutral-400">
                        {format(messageDate, 'h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
