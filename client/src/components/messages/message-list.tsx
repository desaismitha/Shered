import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Message, User } from "@shared/schema";
import { format, isToday, isYesterday } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { CheckCheck, MessageSquare, User as UserIcon } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageListProps {
  groupId: number;
  users: User[];
}

export function MessageList({ groupId, users }: MessageListProps) {
  const { user: currentUser } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/groups", groupId, "messages"],
    refetchInterval: 2000, // Poll for new messages every 2 seconds for more responsiveness
  });
  
  // Initial scroll to bottom when messages first load
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
  
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
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
  
  // Get user initials for avatar
  const getUserInitials = (name?: string): string => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };
  
  // Get friendly date format
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
  
  // Determine if we should show the sender's avatar and name (should only show once at start of a sequence)
  const shouldShowSender = (messages: Message[], index: number, userId: number): boolean => {
    if (index === 0) return true; // Always show for first message
    const prevMessage = messages[index - 1];
    return prevMessage.userId !== userId; // Show if previous message was from a different user
  };
  
  const getMessageSender = (userId: number) => {
    if (userId === currentUser?.id) return "You";
    const sender = users.find(u => u.id === userId);
    return sender?.displayName || sender?.username || "Unknown User";
  };
  
  return (
    <div ref={chatContainerRef} className="flex flex-col space-y-5 p-4 overflow-y-auto h-full bg-gray-50 rounded-lg">
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
              
              // Determine message bubble styling
              const bubbleStyle = isCurrentUser
                ? "bg-primary-600 text-white rounded-2xl rounded-tr-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm";
              
              // Determine container alignment
              const containerStyle = isCurrentUser
                ? "justify-end ml-12"
                : "justify-start mr-12";
                
              // Determine if this is the last message from this user in a sequence
              const isLastInSequence = index === dateMessages.length - 1 || 
                dateMessages[index + 1].userId !== message.userId;
              
              return (
                <div key={message.id} className="relative">
                  {/* Show sender name for first message in a sequence */}
                  {showSender && !isCurrentUser && (
                    <div className="flex items-center mb-1 pl-12">
                      <span className="text-xs font-medium text-gray-700">
                        {sender}
                      </span>
                    </div>
                  )}
                  
                  <div className={`flex items-end ${containerStyle}`}>
                    {/* Avatar - only show at start of message sequence or for the last message */}
                    {(!isCurrentUser && showSender) && (
                      <Avatar className="w-8 h-8 absolute bottom-0 left-0">
                        <AvatarFallback className="bg-primary-100 text-primary-700 text-xs">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    {/* Message bubble */}
                    <div className={cn("px-4 py-2.5 max-w-[85%]", bubbleStyle)}>
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                    
                    {/* Read status indicator - only show for sender's last message */}
                    {isCurrentUser && isLastInSequence && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CheckCheck className="h-3.5 w-3.5 text-primary-500 ml-1" />
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="text-xs">Delivered</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  
                  {/* Time - only show for last message in a sequence */}
                  {isLastInSequence && (
                    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start pl-12'} mt-1 mb-3`}>
                      <span className="text-[11px] text-gray-500">
                        {format(messageDate, 'h:mm a')}
                      </span>
                    </div>
                  )}
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
