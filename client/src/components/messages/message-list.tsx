import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Message, User } from "@shared/schema";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare } from "lucide-react";

interface MessageListProps {
  groupId: number;
  users: User[];
}

export function MessageList({ groupId, users }: MessageListProps) {
  const { user: currentUser } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/groups", groupId, "messages"],
    refetchInterval: 5000, // Poll for new messages every 5 seconds
  });
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
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
  
  return (
    <div className="space-y-6 p-2">
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
              
              return (
                <div 
                  key={message.id} 
                  className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start max-w-[80%] ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isCurrentUser && (
                      <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mr-2">
                        {messageUser?.displayName?.[0] || messageUser?.username?.[0] || "U"}
                      </div>
                    )}
                    
                    <div className={`space-y-1 ${isCurrentUser ? 'mr-2' : 'ml-0'}`}>
                      {!isCurrentUser && (
                        <p className="text-xs text-neutral-500">
                          {messageUser?.displayName || messageUser?.username || "Unknown User"}
                        </p>
                      )}
                      
                      <div 
                        className={`rounded-lg px-3 py-2 text-sm ${
                          isCurrentUser 
                            ? 'bg-primary-600 text-white' 
                            : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {message.content}
                      </div>
                      
                      <p className="text-xs text-neutral-400 text-right">
                        {format(new Date(message.createdAt), 'h:mm a')}
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
