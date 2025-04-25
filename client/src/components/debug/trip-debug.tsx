import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export function TripDebugger({ tripId }: { tripId: number }) {
  const [newName, setNewName] = useState("Updated Trip Name");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");

  const handleDirectEdit = async () => {
    setLoading(true);
    setResponse("");
    
    try {
      console.log(`Attempting direct trip update for ID ${tripId}`);
      
      // Create a minimal payload for update
      const payload = {
        name: newName,
        description: "Updated via debug tool",
      };
      
      // Make direct fetch request without using any helpers
      const response = await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      
      // Get response text regardless of status
      const responseText = await response.text();
      console.log(`Server response (${response.status}):`, responseText);
      
      setResponse(`Status: ${response.status}\nResponse: ${responseText}`);
      
      // Check if response was successful
      if (!response.ok) {
        toast({
          title: "Update failed",
          description: `Server returned ${response.status}: ${responseText.substring(0, 100)}...`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Trip updated successfully",
          description: "The direct API call worked!",
        });
      }
    } catch (error) {
      console.error("Direct trip update failed:", error);
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 p-4 border rounded-md bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">Trip Update Debugger</h3>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="New trip name" 
          />
          <Button onClick={handleDirectEdit} disabled={loading}>
            {loading ? "Updating..." : "Update Trip Directly"}
          </Button>
        </div>
        
        {response && (
          <div className="p-4 bg-gray-100 rounded-md font-mono text-sm overflow-x-auto">
            <pre>{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
}