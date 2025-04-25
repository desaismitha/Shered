import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";

export default function BasicTripEditPage() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Form state
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("planning");
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load trip data
  useEffect(() => {
    const fetchTrip = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/trips/${tripId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load trip: ${response.status}`);
        }
        
        const trip = await response.json();
        console.log("Loaded trip data:", trip);
        
        // Convert dates to YYYY-MM-DD format for input
        const formatDate = (dateStr: string | null) => {
          if (!dateStr) return '';
          try {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) 
              ? '' 
              : date.toISOString().split('T')[0]; // YYYY-MM-DD
          } catch (e) {
            console.error("Error parsing date:", e);
            return '';
          }
        };
        
        // Set form values
        setName(trip.name || '');
        setDestination(trip.destination || '');
        setStartDate(formatDate(trip.startDate));
        setEndDate(formatDate(trip.endDate));
        setStatus(trip.status || 'planning');
        
      } catch (err) {
        console.error("Error loading trip:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    
    if (tripId) {
      fetchTrip();
    }
  }, [tripId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Construct the payload with explicit nulls for empty dates
      const payload = {
        name,
        destination,
        status,
        // Use null for empty date strings
        startDate: startDate ? startDate : null,
        endDate: endDate ? endDate : null
      };
      
      console.log("Sending update with payload:", payload);
      
      const response = await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      
      if (!response.ok) {
        // Try to get error details from response
        let errorText = await response.text();
        try {
          // Try to parse as JSON
          const errorJson = JSON.parse(errorText);
          errorText = errorJson.message || errorText;
        } catch (e) {
          // If not JSON, use the text as is
        }
        
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      
      toast({
        title: "Trip updated",
        description: "Trip details have been updated successfully"
      });
      
      // Go back to trip details
      navigate(`/trips/${tripId}`);
      
    } catch (err) {
      console.error("Failed to update trip:", err);
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-4">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Trip
        </Button>
        
        <h1 className="text-2xl font-bold mb-6">Edit Trip</h1>
        
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center">
            <h2 className="text-lg font-semibold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600">{error}</p>
            <Button className="mt-4" onClick={() => navigate('/trips')}>
              Back to Trips
            </Button>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-1">Trip Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Destination</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  />
                  <div className="text-sm text-gray-500 mt-1">
                    {startDate ? new Date(startDate).toLocaleDateString() : "No start date"}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  />
                  <div className="text-sm text-gray-500 mt-1">
                    {endDate ? new Date(endDate).toLocaleDateString() : "No end date"}
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="planning">Planning</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/trips/${tripId}`)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Trip"
                  )}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </AppShell>
  );
}