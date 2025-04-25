import { AppShell } from "@/components/layout/app-shell";
import { useQuery } from "@tanstack/react-query";
import { Group } from "@shared/schema";
import { GroupCard } from "@/components/groups/group-card";
import { Button } from "@/components/ui/button";
import { PlusIcon, Search, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Filter groups based on search query
  const filteredGroups = groups?.filter(group => {
    return searchQuery === "" || 
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (group.description?.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4 sm:mb-0">
            My Groups
          </h1>
          <Button 
            onClick={() => navigate("/groups/new")}
            className="inline-flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create New Group
          </Button>
        </div>
        
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search groups by name"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white shadow rounded-lg overflow-hidden p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <Skeleton className="h-10 w-10 rounded-md mr-4" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-4 w-full mb-4" />
                <div className="flex justify-between items-center">
                  <div className="flex -space-x-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGroups && filteredGroups.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <Users className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">
              {searchQuery ? "No groups found" : "No groups yet"}
            </h3>
            <p className="text-neutral-500 mb-6">
              {searchQuery 
                ? "Try a different search term" 
                : "Create a group to start planning trips together"}
            </p>
            {!searchQuery && (
              <Button 
                onClick={() => navigate("/groups/new")}
                className="inline-flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create First Group
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
