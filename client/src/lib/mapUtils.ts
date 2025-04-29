import { useEffect, useState, useRef } from 'react';

/**
 * Function to fetch a route from Mapbox Directions API
 * @param startLat Starting latitude
 * @param startLng Starting longitude
 * @param endLat Ending latitude
 * @param endLng Ending longitude
 * @returns A promise that resolves to a GeoJSON LineString of the route
 */
// Mapbox tokens have expiration dates or access restrictions
// Let's use a more robust fallback approach with direct LineString creation
// instead of relying on a token
const HARDCODED_MAPBOX_TOKEN = null;

/**
 * Create a simple straight-line GeoJSON route between two points
 * This is a fallback when Mapbox API is not available
 */
function createStraightLineRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
  // Calculate approximate distance using Haversine formula
  const R = 6371000; // Earth radius in meters
  const dLat = (endLat - startLat) * Math.PI / 180;
  const dLon = (endLng - startLng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Estimate duration: assume average speed of 50 km/h (13.9 m/s)
  const duration = distance / 13.9;
  
  // Create a simple GeoJSON LineString
  const routeGeometry = {
    type: "LineString",
    coordinates: [
      [startLng, startLat],
      [endLng, endLat]
    ]
  };
  
  return {
    route: {
      type: "LineString",
      coordinates: [
        [startLng, startLat],
        [endLng, endLat]
      ]
    },
    duration,
    distance
  };
}

export async function fetchMapboxRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
  try {
    // Validate input coordinates
    if (!isValidCoordinate(startLat, startLng) || !isValidCoordinate(endLat, endLng)) {
      console.warn('Invalid coordinates provided to fetchMapboxRoute. Using straight line as fallback.');
      return createStraightLineRoute(startLat, startLng, endLat, endLng);
    }
    
    // Format coordinates as lng,lat as required by Mapbox
    const startCoords = `${startLng},${startLat}`;
    const endCoords = `${endLng},${endLat}`;
    
    console.log(`Fetching route from [${startLat}, ${startLng}] to [${endLat}, ${endLng}]`);
    
    // Use server proxy to avoid CORS issues
    // We no longer need to send the token - it's stored securely on the server
    const response = await fetch(`/api/mapbox/directions?start=${startCoords}&end=${endCoords}`);
    
    if (!response.ok) {
      console.warn(`Mapbox API returned ${response.status} ${response.statusText}. Using straight line route as fallback.`);
      return createStraightLineRoute(startLat, startLng, endLat, endLng);
    }
    
    const data = await response.json();
    
    // Check if the response contains a valid route
    if (data.routes && data.routes.length > 0) {
      console.log('Successfully fetched route from Mapbox API');
      console.log('Route geometry data:', {
        type: data.routes[0].geometry.type,
        coordinatesCount: data.routes[0].geometry.coordinates.length,
        firstCoordinate: data.routes[0].geometry.coordinates[0],
        lastCoordinate: data.routes[0].geometry.coordinates[data.routes[0].geometry.coordinates.length - 1],
        distance: data.routes[0].distance,
        duration: data.routes[0].duration
      });
      
      return {
        route: data.routes[0].geometry,
        duration: data.routes[0].duration, // in seconds
        distance: data.routes[0].distance, // in meters
        steps: data.routes[0].steps || [] // Step-by-step instructions if available
      };
    } else if (data.message && data.message.includes("Not Authorized")) {
      console.warn('Mapbox API token is invalid. Using straight line route as fallback.');
      return createStraightLineRoute(startLat, startLng, endLat, endLng);
    } else {
      console.warn('No route found from Mapbox. Using straight line route as fallback.');
      return createStraightLineRoute(startLat, startLng, endLat, endLng);
    }
  } catch (error) {
    console.error('Error fetching route, using fallback:', error);
    return createStraightLineRoute(startLat, startLng, endLat, endLng);
  }
}

/**
 * Check if a coordinate is valid (not NaN, null, undefined, or out of range)
 */
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    lat !== null && 
    lng !== null && 
    !isNaN(lat) && 
    !isNaN(lng) && 
    lat >= -90 && 
    lat <= 90 && 
    lng >= -180 && 
    lng <= 180
  );
}

/**
 * Hook to fetch and manage route data between two points
 */
export function useMapboxRoute(
  startCoords: { lat: number, lng: number } | null, 
  endCoords: { lat: number, lng: number } | null
) {
  // Debug: Check if Mapbox token is available
  useEffect(() => {
    const envToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    const fallbackToken = HARDCODED_MAPBOX_TOKEN;
    
    if (!envToken) {
      console.log('Using fallback Mapbox token:', fallbackToken ? 'Available' : 'Not available');
    } else {
      console.log('Using environment Mapbox token');
    }
  }, []);
  
  const [routeData, setRouteData] = useState<{
    geometry: any;
    duration: number;
    distance: number;
    loading: boolean;
    error: string | null;
  }>({
    geometry: null,
    duration: 0,
    distance: 0,
    loading: false,
    error: null
  });
  
  // Use a ref to track whether we've already made a request for these coordinates
  // This prevents the infinite loop in the maximum update depth
  const requestedForRef = useRef<string | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    
    // Only fetch if we have both coordinates
    if (!startCoords || !endCoords) {
      return;
    }
    
    // Create a string representation of the coordinates to detect changes
    const coordKey = `${startCoords.lat},${startCoords.lng}|${endCoords.lat},${endCoords.lng}`;
    
    // If we've already requested this exact route, don't request again
    if (requestedForRef.current === coordKey) {
      return;
    }
    
    // Mark that we're requesting this route
    requestedForRef.current = coordKey;
    
    const fetchRoute = async () => {
      setRouteData(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        const result = await fetchMapboxRoute(
          startCoords.lat,
          startCoords.lng,
          endCoords.lat,
          endCoords.lng
        );
        
        if (result && isMounted) {
          console.log('MapBox route fetched successfully!', {
            hasRoute: !!result.route,
            routeType: result.route?.type || 'No type',
            coordinatesCount: result.route?.coordinates?.length || 0
          });
          
          setRouteData({
            geometry: result.route,
            duration: result.duration,
            distance: result.distance,
            loading: false,
            error: null
          });
        } else if (isMounted) {
          setRouteData(prev => ({
            ...prev,
            loading: false,
            error: 'Failed to fetch route'
          }));
        }
      } catch (error) {
        if (isMounted) {
          setRouteData(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      }
    };
    
    fetchRoute();
    
    return () => {
      isMounted = false;
    };
  }, [startCoords, endCoords]);
  
  return routeData;
}

/**
 * Format duration in seconds to a human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

/**
 * Format distance in meters to a human-readable string
 */
export function formatDistance(meters: number, useImperial = false): string {
  if (useImperial) {
    // Convert to miles
    const miles = meters / 1609.34;
    
    if (miles < 0.1) {
      // For very short distances, use feet
      const feet = meters * 3.28084;
      return `${Math.round(feet)} ft`;
    }
    
    return miles < 10 
      ? `${miles.toFixed(1)} mi` 
      : `${Math.round(miles)} mi`;
  } else {
    // Metric system
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    
    const km = meters / 1000;
    return km < 10 
      ? `${km.toFixed(1)} km` 
      : `${Math.round(km)} km`;
  }
}