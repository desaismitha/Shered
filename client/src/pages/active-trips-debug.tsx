import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { formatDateRange } from '@/lib/utils';

// Simple type for trip
type Trip = {
  id: number;
  name: string;
  status: string | null;
  startDate: string | Date;
  endDate: string | Date;
  startLocation: string | null;
  destination: string | null;
};

export default function ActiveTripsDebug() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Function to directly fetch trips
  const fetchTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Direct fetch API call
      const response = await fetch('/api/trips');
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const allTrips = await response.json();
      console.log('All trips:', allTrips);
      
      // Find active trips (status === 'in-progress')
      const activeTrips = allTrips.filter((trip: Trip) => trip.status === 'in-progress');
      console.log('Active trips:', activeTrips);
      
      // Find trips #26 and #28 specifically
      const trip26 = allTrips.find((trip: Trip) => trip.id === 26);
      const trip28 = allTrips.find((trip: Trip) => trip.id === 28);
      console.log('Trip #26:', trip26);
      console.log('Trip #28:', trip28);
      
      setTrips(allTrips);
    } catch (err) {
      console.error('Error fetching trips:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch trips on component mount
  useEffect(() => {
    if (user) {
      fetchTrips();
    }
  }, [user]);
  
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Active Trips Debug</h1>
          <Button onClick={fetchTrips} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Trips'}
          </Button>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-800 p-4 rounded-md mb-6">
            Error: {error}
          </div>
        )}
        
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">In-progress Trips</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips
              .filter(trip => trip.status === 'in-progress')
              .map(trip => (
                <Card key={trip.id} className="overflow-hidden h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex justify-between">
                      <span>{trip.name}</span>
                      <span className="text-sm bg-amber-100 text-amber-800 py-1 px-2 rounded-full">
                        {trip.status}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>ID:</strong> {trip.id}</p>
                    <p><strong>Dates:</strong> {formatDateRange(trip.startDate, trip.endDate)}</p>
                    <p><strong>From:</strong> {trip.startLocation || 'Not specified'}</p>
                    <p><strong>To:</strong> {trip.destination || 'Not specified'}</p>
                  </CardContent>
                </Card>
              ))
            }
            {trips.filter(trip => trip.status === 'in-progress').length === 0 && (
              <div className="col-span-full text-center p-6 bg-gray-50 rounded-lg">
                No in-progress trips found
              </div>
            )}
          </div>
        </div>
        
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">All Trips ({trips.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map(trip => (
              <Card key={trip.id} className="overflow-hidden h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    <span>{trip.name}</span>
                    <span className={`text-sm py-1 px-2 rounded-full ${getBadgeColor(trip.status)}`}>
                      {trip.status || 'Unknown'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p><strong>ID:</strong> {trip.id}</p>
                  <p><strong>Dates:</strong> {formatDateRange(trip.startDate, trip.endDate)}</p>
                  <p><strong>From:</strong> {trip.startLocation || 'Not specified'}</p>
                  <p><strong>To:</strong> {trip.destination || 'Not specified'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Helper function to get badge color based on status
function getBadgeColor(status: string | null) {
  if (!status) return 'bg-gray-100 text-gray-800';
  
  switch (status.toLowerCase()) {
    case 'planning':
      return 'bg-blue-100 text-blue-800';
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'in-progress':
      return 'bg-amber-100 text-amber-800';
    case 'completed':
      return 'bg-purple-100 text-purple-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}