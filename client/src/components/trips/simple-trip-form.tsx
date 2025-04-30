import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Group } from "@shared/schema";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn, normalizeDate } from "@/lib/utils";
import MapLocationPicker from "@/components/maps/map-location-picker";
import RouteMapPreview from "@/components/maps/route-map-preview";

export function SimpleTripForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Form state
  const [name, setName] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("planning");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Fetch user's groups
  const { data: groups, isLoading: isLoadingGroups } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  // Validation function
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    
    if (!name || name.trim().length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    }
    
    if (!destination || destination.trim().length < 2) {
      newErrors.destination = "Destination is required";
    }
    
    if (!startDate) {
      newErrors.startDate = "Start date is required";
    }
    
    if (!endDate) {
      newErrors.endDate = "End date is required";
    } else if (startDate && endDate && endDate < startDate) {
      newErrors.endDate = "End date cannot be before start date";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !user) return;
    
    setIsSubmitting(true);
    
    try {
      // Create trip data - Ensure dates are in proper ISO format
      const tripData = {
        name,
        startLocation: startLocation || null,
        destination,
        description: description || null,
        imageUrl: imageUrl || null,
        status,
        groupId: groupId,
        // Format dates as expected by the backend - use noon UTC format
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        createdBy: user.id
      };
      
      console.log("Creating trip with data:", tripData);
      
      const res = await apiRequest("POST", "/api/trips", tripData);
      const trip = await res.json();
      
      console.log("Trip created:", trip);
      
      // Success
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      if (groupId) {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "trips"] });
      }
      
      toast({
        title: "Success!",
        description: "Your trip has been created.",
      });
      
      navigate("/trips");
    } catch (error) {
      console.error("Error creating trip:", error);
      toast({
        title: "Error",
        description: `Failed to create trip: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Trip Name<span className="text-red-500">*</span></Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Summer vacation"
          className={errors.name ? "border-red-500" : ""}
        />
        {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <MapLocationPicker
            label="Starting Location"
            value={startLocation}
            onChange={setStartLocation}
            placeholder="Enter starting location"
          />
          {errors.startLocation && <p className="text-red-500 text-sm">{errors.startLocation}</p>}
        </div>

        <div className="space-y-2">
          <MapLocationPicker
            label="Destination"
            value={destination}
            onChange={setDestination}
            placeholder="Enter destination"
            required
          />
          {errors.destination && <p className="text-red-500 text-sm">{errors.destination}</p>}
        </div>
        
        {/* Unified Map View - only when both locations have values */}
        {startLocation && destination && (
          <div className="border rounded-md p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium">Route Map Preview</h3>
            </div>
            <RouteMapPreview 
              startLocation={startLocation}
              endLocation={destination}
              showMap={true} 
              onToggleMap={() => {}} // We're always showing the map
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date<span className="text-red-500">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="startDate"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground",
                  errors.startDate && "border-red-500"
                )}
              >
                {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  if (date) {
                    // Create a noon UTC date to avoid timezone issues
                    const dateStr = `${format(date, 'yyyy-MM-dd')}T12:00:00Z`;
                    setStartDate(new Date(dateStr));
                  } else {
                    setStartDate(undefined);
                  }
                }}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {errors.startDate && <p className="text-red-500 text-sm">{errors.startDate}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="endDate">End Date<span className="text-red-500">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="endDate"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !endDate && "text-muted-foreground",
                  errors.endDate && "border-red-500"
                )}
              >
                {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => {
                  if (date) {
                    // Create a noon UTC date to avoid timezone issues
                    const dateStr = `${format(date, 'yyyy-MM-dd')}T12:00:00Z`;
                    setEndDate(new Date(dateStr));
                  } else {
                    setEndDate(undefined);
                  }
                }}
                disabled={(date) => 
                  date < new Date() || 
                  (startDate ? date < startDate : false)
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {errors.endDate && <p className="text-red-500 text-sm">{errors.endDate}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us about your trip plans"
          className="resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="imageUrl">Image URL (optional)</Label>
        <Input
          id="imageUrl"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select defaultValue={status} onValueChange={setStatus}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="groupId">Travel Group</Label>
        <Select onValueChange={(value) => setGroupId(value ? parseInt(value) : null)}>
          <SelectTrigger id="groupId">
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            {isLoadingGroups ? (
              <SelectItem value="loading" disabled>Loading groups...</SelectItem>
            ) : groups && groups.length > 0 ? (
              groups.map((group) => (
                <SelectItem key={group.id} value={group.id.toString()}>
                  {group.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="no-groups" disabled>
                No groups available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end space-x-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/trips")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Trip"}
        </Button>
      </div>
    </form>
  );
}