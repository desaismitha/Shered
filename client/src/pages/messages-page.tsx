import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Group, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  InfoIcon, 
  MessageSquare, 
  PlusIcon, 
  Search, 
  Settings, 
  Users 
} from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageList } from "@/components/messages/message-list";
import { MessageForm } from "@/components/messages/message-form";
import { Input } from "@/components/ui/input";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function MessagesPage() {
  const [, navigate] = useLocation();
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(!isMobileView);
  
  // Get all groups the user is a member of
  const { data: groups, isLoading: isLoadingGroups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Get all users for message details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);
      if (!mobile) setShowSidebar(true);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set the first group as selected if none is selected yet
  if (groups && groups.length > 0 && !selectedGroup) {
    setSelectedGroup(groups[0].id);
    // On mobile, hide sidebar when a group is selected
    if (isMobileView) setShowSidebar(false);
  }
  
  // Helper to get initials from group name
  const getGroupInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  // Get selected group details
  const selectedGroupDetails = groups?.find(g => g.id === selectedGroup);
  
  // Get group members count
  const getGroupMembersCount = (groupId: number): number => {
    // In a real implementation, this would fetch the actual count
    return 3; // Placeholder - we know this group has 3 members
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto h-[calc(100vh-80px)] bg-white shadow-sm border rounded-lg overflow-hidden">
        <div className="flex h-full">
          {/* Group List Sidebar */}
          {showSidebar && (
            <div className="w-full md:w-80 border-r flex flex-col">
              {/* Sidebar Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Messages</h2>
                <div className="flex items-center space-x-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-full"
                          onClick={() => navigate("/groups/new")}
                        >
                          <PlusIcon className="h-5 w-5" />
                          <span className="sr-only">New Group</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">Create New Group</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              {/* Search Bar */}
              <div className="px-3 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search conversations" 
                    className="pl-8 h-9 bg-gray-50"
                  />
                </div>
              </div>
              
              {/* Groups List */}
              <div className="flex-1 overflow-y-auto">
                {isLoadingGroups ? (
                  <div className="p-3 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3 p-2">
                        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : groups && groups.length > 0 ? (
                  <div className="p-1">
                    {groups.map(group => (
                      <div 
                        key={group.id} 
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                          selectedGroup === group.id 
                            ? "bg-primary-50 text-primary-600" 
                            : "hover:bg-gray-50"
                        )}
                        onClick={() => {
                          setSelectedGroup(group.id);
                          if (isMobileView) setShowSidebar(false);
                        }}
                      >
                        <Avatar className="h-12 w-12 border">
                          <AvatarFallback className={
                            selectedGroup === group.id 
                              ? "bg-primary-100 text-primary-700" 
                              : "bg-gray-100 text-gray-700"
                          }>
                            {getGroupInitials(group.name)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h3 className={cn(
                              "font-medium truncate",
                              selectedGroup === group.id ? "text-primary-600" : "text-gray-900"
                            )}>
                              {group.name}
                            </h3>
                            <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                              3d ago
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-500 truncate">
                              {group.description || "No description"}
                            </p>
                            
                            {/* Show unread message count or active members badge */}
                            <Badge variant="outline" className="ml-2 h-5 bg-gray-100">
                              <Users className="h-3 w-3 mr-1" />
                              <span className="text-xs">{getGroupMembersCount(group.id)}</span>
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                    <div className="bg-gray-50 p-6 rounded-full mb-4">
                      <MessageSquare className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-base font-medium text-gray-800 mb-1">No groups yet</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-xs">
                      Create a group to start messaging with your travel companions
                    </p>
                    <Button 
                      onClick={() => navigate("/groups/new")}
                      size="sm"
                      className="inline-flex items-center"
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Create Group
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Messages Area */}
          <div className="flex-1 flex flex-col h-full">
            {selectedGroup && selectedGroupDetails ? (
              <>
                {/* Chat Header */}
                <div className="p-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isMobileView && !showSidebar && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 mr-1"
                        onClick={() => setShowSidebar(true)}
                      >
                        <ChevronLeft className="h-5 w-5" />
                        <span className="sr-only">Back</span>
                      </Button>
                    )}
                    
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary-100 text-primary-700">
                        {getGroupInitials(selectedGroupDetails.name)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div>
                      <h3 className="font-medium text-gray-900 leading-none mb-0.5">
                        {selectedGroupDetails.name}
                      </h3>
                      <p className="text-xs text-gray-500 flex items-center">
                        <Users className="h-3 w-3 mr-1" />
                        <span>{getGroupMembersCount(selectedGroupDetails.id)} members</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-full text-gray-500"
                            onClick={() => navigate(`/groups/${selectedGroupDetails.id}`)}
                          >
                            <InfoIcon className="h-5 w-5" />
                            <span className="sr-only">Group Info</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">Group Info</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              
                {/* Messages Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-y-auto">
                    <MessageList groupId={selectedGroup} users={users || []} />
                  </div>
                  <MessageForm groupId={selectedGroup} />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center p-6 max-w-md">
                  <div className="bg-gray-100 p-6 rounded-full inline-block mb-4">
                    <MessageSquare className="h-10 w-10 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Select a conversation</h3>
                  <p className="text-gray-500 mb-6">
                    Choose a group from the sidebar to start or continue a conversation with your travel companions.
                  </p>
                  <Button 
                    onClick={() => setShowSidebar(true)}
                    variant="outline"
                    className="inline-flex items-center"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    View Groups
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
