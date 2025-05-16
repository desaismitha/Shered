import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPinIcon, PlusIcon, ClockIcon } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMapUtils } from "@/hooks/use-map-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface SavedLocation {
  id: number;
  name: string;
  address: string; // Contains both address and coordinates in format "Address [lat, lng]"
  visitCount: number;
  lastVisited: Date;
  userId: number;
  createdAt: Date;
}

export function RecentlyVisitedLocations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: "",
    address: ""
  });

  // Get map utility functions
  const { 
    getAddressWithCoordinates, 
    cleanAddressString, 
    extractCoordinatesFromAddress 
  } = useMapUtils();

  // Fetch saved locations
  const { data: locations = [], isLoading } = useQuery<SavedLocation[]>({
    queryKey: ["/api/locations"],
    enabled: !!user,
  });

  // Create saved location mutation
  const createLocationMutation = useMutation({
    mutationFn: async (formData: typeof newLocation) => {
      const response = await apiRequest("POST", "/api/locations", formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Location saved",
        description: "Your location has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save location",
        description: error.message || "An error occurred while saving your location.",
        variant: "destructive",
      });
    }
  });

  // Increment visit count mutation
  const incrementVisitMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/locations/${id}/visit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update location",
        description: error.message || "An error occurred while updating location visit count.",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLocationMutation.mutate(newLocation);
  };

  // Reset form fields
  const resetForm = () => {
    setNewLocation({
      name: "",
      address: ""
    });
  };

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            // Get address from coordinates using reverse geocoding
            const address = await getAddressWithCoordinates(latitude, longitude);
            
            setNewLocation({
              ...newLocation,
              address: address
            });
            
            toast({
              title: "Location detected",
              description: "Your current location has been added to the form",
            });
          } catch (error) {
            toast({
              title: "Could not get address",
              description: "Unable to convert your coordinates to an address",
              variant: "destructive",
            });
          }
        },
        (error) => {
          toast({
            title: "Could not get location",
            description: error.message,
            variant: "destructive",
          });
        }
      );
    } else {
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Recently Visited Locations</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsAddDialogOpen(true)} 
          className="text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          Add Location
        </Button>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 animate-pulse">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="h-40 bg-gray-100" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <MapPinIcon className="h-8 w-8 text-gray-400" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium">No saved locations yet</h3>
              <p className="text-sm text-gray-500">
                Save locations you visit frequently to quickly access them when creating schedules.
              </p>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Your First Location
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {locations.map((location) => (
            <Card 
              key={location.id} 
              className="group relative h-40 overflow-hidden shadow cursor-pointer hover:shadow-md transition-shadow duration-200"
              onClick={() => incrementVisitMutation.mutate(location.id)}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent group-hover:from-black/80 transition-colors duration-300 flex flex-col justify-end p-3">
                <h3 className="font-medium text-sm text-white">{location.name}</h3>
                <p className="text-xs text-gray-300 truncate">
                  {cleanAddressString(location.address)}
                </p>
                <div className="flex items-center mt-1 text-xs text-gray-300">
                  <MapPinIcon className="h-3 w-3 mr-1" />
                  {(() => {
                    const coords = extractCoordinatesFromAddress(location.address);
                    return coords ? 
                      `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 
                      'No coordinates';
                  })()}
                </div>
                <div className="flex items-center mt-1 text-xs text-gray-300">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  <span>Visited {location.visitCount} times</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Location Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save a Location</DialogTitle>
            <DialogDescription>
              Add a frequently visited location to quickly access it when creating schedules.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Location Name</Label>
                <Input
                  id="name"
                  placeholder="Home, School, Office, etc."
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="Full address"
                  value={newLocation.address}
                  onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                  required
                />
              </div>
              {/* No separate latitude/longitude fields, just address with embedded coordinates */}
              <Button 
                type="button" 
                variant="outline" 
                onClick={getCurrentLocation}
                className="w-full"
              >
                <MapPinIcon className="h-4 w-4 mr-2" />
                Use My Current Location
              </Button>
            </div>
            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsAddDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createLocationMutation.isPending}
              >
                {createLocationMutation.isPending ? "Saving..." : "Save Location"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}