import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Group, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { PlusIcon, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageList } from "@/components/messages/message-list";
import { MessageForm } from "@/components/messages/message-form";

export default function MessagesPage() {
  const [, navigate] = useLocation();
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  
  // Get all groups the user is a member of
  const { data: groups, isLoading: isLoadingGroups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Get all users for message details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Set the first group as selected if none is selected yet
  if (groups && groups.length > 0 && !selectedGroup) {
    setSelectedGroup(groups[0].id);
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-1">
              Messages
            </h1>
            <p className="text-neutral-500">
              Chat with your travel groups
            </p>
          </div>
          
          <div className="mt-4 md:mt-0">
            <Button 
              onClick={() => navigate("/groups/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Group
            </Button>
          </div>
        </div>
        
        {isLoadingGroups ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b">
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="h-[600px] p-6">
              <div className="space-y-4 mb-6">
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
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
        ) : groups && groups.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Group Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs 
                value={selectedGroup?.toString() || "none"} 
                onValueChange={(value) => setSelectedGroup(value !== "none" ? parseInt(value) : null)}
                className="h-[600px]"
              >
                <TabsList className="mb-4 flex flex-nowrap overflow-x-auto">
                  {groups.map(group => (
                    <TabsTrigger 
                      key={group.id} 
                      value={group.id.toString()}
                      className="whitespace-nowrap"
                    >
                      {group.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {groups.map(group => (
                  <TabsContent 
                    key={group.id} 
                    value={group.id.toString()}
                    className="h-full flex flex-col"
                  >
                    <div className="flex-1 overflow-y-auto mb-4">
                      <MessageList groupId={group.id} users={users || []} />
                    </div>
                    <MessageForm groupId={group.id} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <MessageSquare className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">No message groups yet</h3>
            <p className="text-neutral-500 mb-6">Create or join a group to start messaging</p>
            <Button 
              onClick={() => navigate("/groups/new")}
              className="inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
