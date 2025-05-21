import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// Using Input for date fields instead of DatePicker for a simpler implementation
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Using Input instead of MapLocationPicker for a simpler implementation
import { Group } from "@shared/schema";
import { Loader2 } from "lucide-react";

export default function SimpleScheduleCreate() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  // State for form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  
  // Get user's groups for the dropdown
  const { data: groups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });
  
  // Mutation for creating a schedule
  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      console.log("Creating new schedule with data:", JSON.stringify(formData));
      
      try {
        const res = await apiRequest("POST", "/api/schedules", formData);
        console.log("Schedule creation response:", res);
        return await res.json();
      } catch (error) {
        console.error("Schedule creation failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Your schedule has been created successfully.",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      
      // Navigate back to schedules page
      setTimeout(() => {
        navigate("/schedules");
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create schedule: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !startLocation || !endLocation || !groupId) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Prepare schedule data
    const scheduleData = {
      name,
      description,
      startDate,
      endDate,
      startLocation,
      destination: endLocation,
      groupId,
      status: "planning",
      isRecurring: false,
      enableMobileNotifications: true,
      enableEmailNotifications: true,
      
      // Always create a single itinerary item
      itineraryItems: [{
        day: 1,
        title: name,
        description,
        fromLocation: startLocation,
        toLocation: endLocation,
        startTime,
        endTime,
        isRecurring: false,
      }],
    };
    
    // Submit the data
    console.log("Submitting schedule data:", scheduleData);
    mutation.mutate(scheduleData);
  };
  
  return (
    <AppShell>
      <div className="container py-6">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Create New Schedule</h1>
            <Button variant="outline" onClick={() => navigate("/schedules")}>
              Cancel
            </Button>
          </div>
          
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Schedule Name*</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter schedule name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Date*</label>
                    <Input
                      type="date"
                      value={startDate.toISOString().split('T')[0]}
                      onChange={(e) => setStartDate(new Date(e.target.value))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End Date*</label>
                    <Input
                      type="date"
                      value={endDate.toISOString().split('T')[0]}
                      onChange={(e) => setEndDate(new Date(e.target.value))}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start Time*</label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End Time*</label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Group*</label>
                  <Select value={groupId?.toString()} onValueChange={(value) => setGroupId(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups?.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Start Location*</label>
                  <Input
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    placeholder="Enter start location"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Destination*</label>
                  <Input
                    value={endLocation}
                    onChange={(e) => setEndLocation(e.target.value)}
                    placeholder="Enter destination"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Schedule...
                  </>
                ) : (
                  "Create Schedule"
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}