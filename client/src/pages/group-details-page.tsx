import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Group, Trip, GroupMember, User, InsertGroupMember } from "@shared/schema";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, PlusIcon, Calendar, Info, ArrowLeft, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TripCard } from "@/components/trips/trip-card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { MessageList } from "@/components/messages/message-list";
import { MessageForm } from "@/components/messages/message-form";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export default function GroupDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [usernameToAdd, setUsernameToAdd] = useState("");

  // Get group details
  const { data: group, isLoading: isLoadingGroup } = useQuery<Group>({
    queryKey: ["/api/groups", groupId],
    enabled: !!groupId,
  });

  // In the API, group members doesn't return what it's supposed to,
  // so we're adding the creator to simulate group members until this is fixed
  const { data: groupMembers, isLoading: isLoadingGroupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", groupId, "members"],
    enabled: !!groupId && !!group,
    initialData: group ? [
      {
        id: 1,
        groupId: group.id,
        userId: group.createdBy,
        role: "admin",
        joinedAt: new Date()
      }
    ] : undefined,
  });

  // Get trips for this group
  const { data: trips, isLoading: isLoadingTrips } = useQuery<Trip[]>({
    queryKey: ["/api/groups", groupId, "trips"],
    enabled: !!groupId,
  });

  // Get all users for member details
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!groupMembers,
  });
  
  // Debug output
  console.log("Group details - Users data:", users);
  console.log("Group details - Group members:", groupMembers);
  console.log("Group creator ID:", group?.createdBy);
  console.log("Creator user object:", users?.find(u => u.id === group?.createdBy));

  // Check if current user is admin
  const isAdmin = groupMembers?.some(
    member => member.userId === user?.id && member.role === "admin"
  );

  // Add member mutation
  const addMemberSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    role: z.enum(["member", "admin"]).default("member"),
  });

  type AddMemberValues = z.infer<typeof addMemberSchema>;

  const addMemberForm = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      username: "",
      role: "member",
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: async (values: AddMemberValues) => {
      // First, we need to get the user ID by username
      const userRes = await apiRequest("GET", `/api/users/by-username/${values.username}`);
      const foundUser = await userRes.json();
      
      if (!foundUser || !foundUser.id) {
        throw new Error("User not found");
      }
      
      const memberData: InsertGroupMember = {
        groupId: groupId,
        userId: foundUser.id,
        role: values.role,
      };
      
      const res = await apiRequest("POST", `/api/groups/${groupId}/members`, memberData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] });
      toast({
        title: "Success!",
        description: "Member added to the group.",
      });
      setIsAddMemberOpen(false);
      addMemberForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add member: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onAddMemberSubmit = (values: AddMemberValues) => {
    addMemberMutation.mutate(values);
  };

  if (isLoadingGroup) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Skeleton className="h-8 w-60 mb-4" />
          <Skeleton className="h-6 w-full max-w-md mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Skeleton className="h-[300px] w-full mb-6" />
            </div>
            <div>
              <Skeleton className="h-[200px] w-full mb-6" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-12">
            <Info className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-neutral-800 mb-1">Group not found</h2>
            <p className="text-neutral-500 mb-6">The group you're looking for doesn't exist or you don't have access.</p>
            <Button onClick={() => navigate("/groups")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Groups
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Group header */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mb-2 -ml-2 w-fit"
            onClick={() => navigate("/groups")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to groups
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1">
                {group.name}
              </h1>
              <p className="text-neutral-600">
                {groupMembers?.length || 0} members • {trips?.length || 0} trips
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <Button 
                variant="outline"
                onClick={() => navigate(`/trips/new?groupId=${groupId}`)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                New Trip
              </Button>
              {isAdmin && (
                <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Add Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Member</DialogTitle>
                      <DialogDescription>
                        Enter the username of the person you want to add to this group.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <Form {...addMemberForm}>
                      <form onSubmit={addMemberForm.handleSubmit(onAddMemberSubmit)} className="space-y-4">
                        <FormField
                          control={addMemberForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter username" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={addMemberForm.control}
                          name="role"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Role</FormLabel>
                              <div className="flex space-x-4">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    className="form-radio"
                                    value="member"
                                    checked={field.value === "member"}
                                    onChange={() => field.onChange("member")}
                                  />
                                  <span>Member</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    className="form-radio"
                                    value="admin"
                                    checked={field.value === "admin"}
                                    onChange={() => field.onChange("admin")}
                                  />
                                  <span>Admin</span>
                                </label>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <DialogFooter>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setIsAddMemberOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={addMemberMutation.isPending}
                          >
                            {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
        
        {/* Group description */}
        {group.description && (
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <p className="text-neutral-600">{group.description}</p>
          </div>
        )}
        
        {/* Group content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Trips and messages */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="trips">
              <TabsList>
                <TabsTrigger value="trips">Trips</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
              </TabsList>
              
              {/* Trips tab */}
              <TabsContent value="trips">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Group Trips</CardTitle>
                    <Button 
                      size="sm"
                      onClick={() => navigate(`/trips/new?groupId=${groupId}`)}
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      New Trip
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTrips ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[...Array(2)].map((_, i) => (
                          <div key={i} className="bg-white shadow rounded-lg overflow-hidden">
                            <Skeleton className="h-48 w-full" />
                            <div className="p-4">
                              <Skeleton className="h-6 w-3/4 mb-2" />
                              <Skeleton className="h-4 w-1/2 mb-4" />
                              <div className="flex justify-between items-center">
                                <div className="flex space-x-1">
                                  <Skeleton className="h-7 w-7 rounded-full" />
                                  <Skeleton className="h-7 w-7 rounded-full" />
                                  <Skeleton className="h-7 w-7 rounded-full" />
                                </div>
                                <Skeleton className="h-8 w-24" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : trips && trips.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {trips.map((trip) => (
                          <TripCard key={trip.id} trip={trip} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Calendar className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-neutral-700 mb-1">No trips planned yet</h3>
                        <p className="text-neutral-500 mb-6">Start planning your next adventure with this group</p>
                        <Button onClick={() => navigate(`/trips/new?groupId=${groupId}`)}>
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Create First Trip
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Messages tab */}
              <TabsContent value="messages">
                <Card>
                  <CardHeader>
                    <CardTitle>Group Messages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] flex flex-col">
                      <div className="flex-1 overflow-y-auto mb-4">
                        <MessageList groupId={groupId} users={users || []} />
                      </div>
                      <MessageForm groupId={groupId} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Right column - Group members */}
          <div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Group Members</CardTitle>
                {isAdmin && (
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => setIsAddMemberOpen(true)}
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isLoadingGroupMembers ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded-full mr-3" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : group && users ? (
                  <div className="space-y-4">
                    {/* Force show the group creator as a member since the API is not returning members correctly */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mr-3">
                          {users.find(u => u.id === group.createdBy)?.displayName?.[0] || "U"}
                        </div>
                        <div>
                          <p className="font-medium text-neutral-800">
                            {users.find(u => u.id === group.createdBy)?.displayName}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Joined {group.createdAt ? 
                                    new Date(group.createdAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    }) : 'recently'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="capitalize">
                        Admin
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Users className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                    <p className="text-neutral-500">No members found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
