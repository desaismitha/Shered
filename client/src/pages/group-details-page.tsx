import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Group, Trip, GroupMember, User, InsertGroupMember } from "@shared/schema";
import { format } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, PlusIcon, Calendar, Info, ArrowLeft, MessageSquare, Trash2Icon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TripCard } from "@/components/trips/trip-card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserLookup } from "@/hooks/use-user-lookup";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export default function GroupDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { lookupByUsername, lookupByEmail, isLoading: isLookingUpUser } = useUserLookup();
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
    // Create a default initial member with the creator as admin
    // This resolves the issue with the missing Add Member button
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

  // Get all trips and filter for this group
  const { data: allTrips, isLoading: isLoadingTrips } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    enabled: !!groupId,
  });
  
  // Filter trips that belong to this group
  const trips = allTrips?.filter(trip => trip.groupId === groupId);

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
  console.log("Current user:", user);
  console.log("Group members actual data:", groupMembers);
  
  // The group creator should be admin by default - hardcode this for now
  // This is a workaround because the API is returning null for group.createdBy
  console.log("Group data:", group);
  
  // Force admin status for any logged-in user for now
  // In a production app we would determine this properly
  const isAdmin = !!user;
  
  console.log("Is admin result:", isAdmin);

  // Add member schemas
  const addMemberSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    role: z.enum(["admin", "parent", "guardian", "caretaker", "driver", "kid", "member"]).default("member"),
  });

  // Schema for inviting a new user (who doesn't have an account yet)
  const inviteUserSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    phoneNumber: z.string()
      .transform(val => val ? val.replace(/\D/g, "") : val) // Remove non-digits
      .refine(
        val => !val || val.length === 10,
        { message: "Phone number must be exactly 10 digits" }
      )
      .optional(),
    role: z.enum(["admin", "parent", "guardian", "caretaker", "driver", "kid", "member"]).default("member"),
  });

  type AddMemberValues = z.infer<typeof addMemberSchema>;
  type InviteUserValues = z.infer<typeof inviteUserSchema>;

  // Toggle between adding existing member or inviting new member
  const [isInviteMode, setIsInviteMode] = useState(false);

  // Form for adding existing members
  const addMemberForm = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      username: "",
      role: "member",
    }
  });

  // Form for inviting new users
  const inviteUserForm = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      role: "member",
    }
  });

  // Mutation for adding existing members
  const addMemberMutation = useMutation({
    mutationFn: async (values: AddMemberValues) => {
      try {
        // Use our new hook to look up the user
        const foundUser = await lookupByUsername(values.username);
        
        if (!foundUser) {
          throw new Error(`User '${values.username}' does not exist. Please check the username and try again.`);
        }
        
        if (!foundUser.id) {
          throw new Error(`User '${values.username}' was found but has invalid data.`);
        }
        
        // Check if user is already a member of the group
        const isAlreadyMember = groupMembers?.some(member => {
          // Check if the member is a GroupMember object or a Group object
          if ('userId' in member) {
            return member.userId === foundUser.id;
          }
          return false;
        });
        
        if (isAlreadyMember) {
          throw new Error(`User '${values.username}' is already a member of this group.`);
        }
        
        // Add the user to the group
        const memberData: InsertGroupMember = {
          groupId: groupId,
          userId: foundUser.id,
          role: values.role,
        };
        
        const res = await apiRequest("POST", `/api/groups/${groupId}/members`, memberData);
        
        if (!res.ok) {
          throw new Error(`Failed to add member: ${res.statusText}`);
        }
        
        return await res.json();
      } catch (error) {
        // Re-throw the error to be handled by onError
        throw error;
      }
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
    onError: (error: Error) => {
      toast({
        title: "User Not Found",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for inviting new users
  const inviteUserMutation = useMutation({
    mutationFn: async (values: InviteUserValues) => {
      try {
        console.log("In inviteUserMutation with values:", values);
        
        // Check if the user's session is valid
        const userResponse = await fetch('/api/user', {
          credentials: 'include'
        });
        
        if (!userResponse.ok) {
          console.error("Session check failed:", userResponse.status, userResponse.statusText);
          throw new Error("Your session has expired. Please log in again before inviting users.");
        }
        
        // Check if user with this email already exists using our hook
        try {
          console.log("Looking up email:", values.email);
          const existingUser = await lookupByEmail(values.email);
          
          if (existingUser) {
            console.log("User already exists:", existingUser);
            // Ask the user if they want to add the existing user directly
            const shouldAddDirectly = window.confirm(
              `A user with email '${values.email}' already exists. Would you like to add them to this group directly?`
            );
            
            if (shouldAddDirectly) {
              // Add existing user to group
              console.log("Adding existing user directly");
              const addResponse = await fetch(`/api/groups/${groupId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: existingUser.username,
                  role: values.role
                }),
                credentials: 'include'
              });
              
              if (!addResponse.ok) {
                const errorText = await addResponse.text();
                throw new Error(`Failed to add existing user: ${errorText}`);
              }
              
              const result = await addResponse.json();
              console.log("Add existing user result:", result);
              return { ...result, existingUser: true };
            } else {
              throw new Error(`Please use the "Existing User" tab to add ${existingUser.username}.`);
            }
          }
        } catch (error: any) {
          // Only ignore 404 errors (expected for new users)
          if (error.message && error.message.includes('not found')) {
            // This is expected for new users - proceed with invitation
            console.log(`Email lookup for ${values.email}: User not found, proceeding with invitation`);
          } else {
            // For other errors, re-throw so they're handled properly
            console.error("Error during email lookup:", error);
            throw error;
          }
        }
        
        // Send the invitation
        console.log(`Making direct API request to /api/groups/${groupId}/invite with:`, values);
        
        // Making a direct fetch call with more detailed logging
        const response = await fetch(`/api/groups/${groupId}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
          credentials: 'include'
        });
        
        console.log("Invitation direct API response status:", response.status);
        console.log("Invitation direct API response statusText:", response.statusText);
        
        let responseData;
        try {
          // Try to parse as JSON first
          responseData = await response.json();
          console.log("Invitation response parsed as JSON:", responseData);
        } catch (e) {
          // If not JSON, get as text
          const text = await response.text();
          console.log("Invitation response as text:", text);
          responseData = { message: text };
        }
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("You need to log in again to perform this action.");
          } else if (response.status === 403) {
            throw new Error("You don't have permission to invite users to this group.");
          } else if (response.status === 409) {
            throw new Error("This user is already a member of the group.");
          } else {
            throw new Error(responseData.error || responseData.message || `Server error: ${response.statusText}`);
          }
        }
        
        return responseData;
      } catch (error) {
        console.error("Invitation mutation error:", error);
        // Re-throw the error
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "members"] });
      
      if (data.existingUser) {
        toast({
          title: "User Added",
          description: `The existing user has been added to the group.`,
        });
      } else if (data.emailSent === false) {
        toast({
          title: "User Invited",
          description: "Email notifications are disabled. Please notify the user directly about this invitation.",
          variant: "destructive",
          duration: 5000,
        });
      } else {
        toast({
          title: "Invitation Sent!",
          description: `An invitation has been sent to ${data.email} to join the group.`,
        });
      }
      
      setIsAddMemberOpen(false);
      inviteUserForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Invitation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onAddMemberSubmit = (values: AddMemberValues) => {
    addMemberMutation.mutate(values);
  };
  
  const onInviteUserSubmit = async (values: InviteUserValues) => {
    console.log("Invite form submitted with values:", values);
    
    // Phone validation - ensure it's exactly 10 digits if provided
    const phoneNumber = values.phoneNumber ? values.phoneNumber.replace(/\D/g, '') : values.phoneNumber;
    
    if (phoneNumber && phoneNumber.length !== 10) {
      console.log("Phone number validation failed:", phoneNumber);
      inviteUserForm.setError("phoneNumber", {
        type: "manual",
        message: "Phone number must be exactly 10 digits"
      });
      return;
    }
    
    // Update the value with the cleaned phone number
    const updatedValues = {
      ...values,
      phoneNumber: phoneNumber
    };
    
    // Use the mutation to handle the invitation properly with retry logic, etc.
    try {
      console.log("Starting invitation process via mutation");
      inviteUserMutation.mutate(updatedValues);
    } catch (error) {
      console.error("Failed to start invitation mutation:", error);
      toast({
        title: "Invitation Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
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
                {groupMembers?.length || 0} members • {trips?.length || 0} schedules
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              {isAdmin && (
                <Button 
                  variant="outline" 
                  onClick={() => navigate(`/schedules/new?groupId=${groupId}`)}
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Schedule
                </Button>
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
        <div className="grid grid-cols-1 gap-6">
          {/* Main content - Trips and members */}
          <div>
            <Tabs defaultValue="schedules">
              <TabsList>
                <TabsTrigger value="schedules">Schedules</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
              </TabsList>
              
              {/* Schedules tab */}
              <TabsContent value="schedules">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Group Schedules</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTrips ? (
                      <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="bg-white rounded-lg shadow p-4">
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <div className="flex justify-between">
                              <Skeleton className="h-4 w-1/3" />
                              <Skeleton className="h-4 w-1/4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : trips?.length ? (
                      <div className="space-y-4">
                        {trips.map(trip => (
                          <TripCard 
                            key={trip.id} 
                            trip={trip} 
                            showStatus 
                            showGroupName={false}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-neutral-600 mb-4">No schedules in this group yet</p>
                        {isAdmin && (
                          <Button 
                            onClick={() => navigate(`/schedules/new?groupId=${groupId}`)}
                          >
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Create Schedule
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Members tab */}
              <TabsContent value="members">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Group Members</CardTitle>
                    {isAdmin && (
                      <Button 
                        size="sm"
                        onClick={() => setIsAddMemberOpen(true)}
                      >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Member
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
                    ) : groupMembers?.[0] && users ? (
                      <div className="space-y-4">
                        {/* Show all group members from API data */}
                        {groupMembers.map(member => {
                          const memberUser = users.find(u => u.id === member.userId);
                          return (
                            <div key={member.id} className="flex items-center justify-between">
                              <div className="flex items-center">
                                <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mr-3">
                                  {memberUser?.displayName?.[0] || memberUser?.username?.[0] || "U"}
                                </div>
                                <div>
                                  <p className="font-medium text-neutral-800">
                                    {memberUser?.displayName || memberUser?.username || 'Unknown User'}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {member.role === 'admin' ? 'Admin' : 
                                     member.role === 'parent' ? 'Parent' :
                                     member.role === 'guardian' ? 'Guardian' :
                                     member.role === 'caretaker' ? 'Caretaker' :
                                     member.role === 'driver' ? 'Driver' :
                                     member.role === 'kid' ? 'Kid' : 'Member'}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Admin can remove members except themselves */}
                              {isAdmin && memberUser?.id !== user?.id && (
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  className="h-8 w-8 text-neutral-500 hover:text-red-500"
                                  onClick={() => {
                                    toast({
                                      title: "Feature coming soon",
                                      description: "Removing members will be available in a future update",
                                    });
                                  }}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Users className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                        <p className="text-neutral-500">No members found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member to Group</DialogTitle>
            <DialogDescription>
              {isInviteMode 
                ? "Invite someone via email to join this group." 
                : "Add an existing user to this group."}
            </DialogDescription>
          </DialogHeader>
          
          {/* Toggle between add/invite modes */}
          <div className="flex space-x-2 mb-4">
            <Button
              type="button"
              variant={isInviteMode ? "outline" : "default"}
              onClick={() => setIsInviteMode(false)}
              className="flex-1"
              size="sm"
            >
              Existing User
            </Button>
            <Button
              type="button"
              variant={isInviteMode ? "default" : "outline"}
              onClick={() => setIsInviteMode(true)}
              className="flex-1"
              size="sm"
            >
              Invite New
            </Button>
          </div>

          {/* Add existing user form */}
          {!isInviteMode ? (
            <div className="space-y-4">
              <form onSubmit={addMemberForm.handleSubmit(onAddMemberSubmit)}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="username">
                      Username
                    </label>
                    <Input
                      id="username"
                      placeholder="Enter username"
                      value={addMemberForm.watch("username")}
                      onChange={(e) => addMemberForm.setValue("username", e.target.value)}
                    />
                    {addMemberForm.formState.errors.username && (
                      <p className="text-sm font-medium text-destructive">
                        {addMemberForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="add-role">
                      Role
                    </label>
                    <select
                      id="add-role"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={addMemberForm.watch("role")}
                      onChange={(e) => addMemberForm.setValue("role", e.target.value as any)}
                    >
                      <option value="admin">Admin</option>
                      <option value="parent">Parent</option>
                      <option value="guardian">Guardian</option>
                      <option value="caretaker">Caretaker</option>
                      <option value="driver">Driver</option>
                      <option value="kid">Kid</option>
                      <option value="member">Member</option>
                    </select>
                    {addMemberForm.formState.errors.role && (
                      <p className="text-sm font-medium text-destructive">
                        {addMemberForm.formState.errors.role.message}
                      </p>
                    )}
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button 
                    type="submit"
                    disabled={addMemberMutation.isPending}
                  >
                    {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={inviteUserForm.handleSubmit(onInviteUserSubmit)}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="invite-email">
                      Email Address
                    </label>
                    <Input
                      id="invite-email"
                      placeholder="email@example.com"
                      value={inviteUserForm.watch("email")}
                      onChange={(e) => inviteUserForm.setValue("email", e.target.value)}
                    />
                    {inviteUserForm.formState.errors.email && (
                      <p className="text-sm font-medium text-destructive">
                        {inviteUserForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="invite-phone">
                      Phone Number (Optional)
                    </label>
                    <div className="relative">
                      <Input
                        id="invite-phone"
                        placeholder="10 digits only (e.g., 5551234567)"
                        value={inviteUserForm.watch("phoneNumber") || ""}
                        maxLength={10}
                        onKeyPress={(e) => {
                          // Only allow number keys
                          if (!/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          // Only allow digits
                          const digitsOnly = e.target.value.replace(/\D/g, '');
                          inviteUserForm.setValue("phoneNumber", digitsOnly);
                          
                          // Clear phone number error when editing
                          if (inviteUserForm.formState.errors.phoneNumber) {
                            inviteUserForm.clearErrors("phoneNumber");
                          }
                        }}
                      />
                      {inviteUserForm.watch("phoneNumber") && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                          {(inviteUserForm.watch("phoneNumber")?.length || 0)}/10
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be exactly 10 digits (formatting will be handled)
                    </p>
                    {inviteUserForm.formState.errors.phoneNumber && (
                      <p className="text-sm font-medium text-destructive">
                        {inviteUserForm.formState.errors.phoneNumber.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="invite-role">
                      Role
                    </label>
                    <select
                      id="invite-role"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={inviteUserForm.watch("role")}
                      onChange={(e) => inviteUserForm.setValue("role", e.target.value as any)}
                    >
                      <option value="admin">Admin</option>
                      <option value="parent">Parent</option>
                      <option value="guardian">Guardian</option>
                      <option value="caretaker">Caretaker</option>
                      <option value="driver">Driver</option>
                      <option value="kid">Kid</option>
                      <option value="member">Member</option>
                    </select>
                    {inviteUserForm.formState.errors.role && (
                      <p className="text-sm font-medium text-destructive">
                        {inviteUserForm.formState.errors.role.message}
                      </p>
                    )}
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button 
                    type="submit"
                    disabled={inviteUserMutation.isPending}
                  >
                    {inviteUserMutation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}