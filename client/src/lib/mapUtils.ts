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
  
  // Also include leafletPositions directly to avoid later conversion issues
  return {
    route: {
      type: "LineString",
      coordinates: [
        [startLng, startLat],
        [endLng, endLat]
      ]
    },
    duration,
    distance,
    leafletPositions: [
      [startLat, startLng],
      [endLat, endLng]
    ] as [number, number][]
  };
}

// Define return type for the fetch function to include leafletPositions
interface RouteResult {
  route: any;
  duration: number;
  distance: number;
  steps?: any[];
  leafletPositions: [number, number][];
}

export async function fetchMapboxRoute(startLat: number, startLng: number, endLat: number, endLng: number): Promise<RouteResult> {
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
      
      // Process the coordinates for Leaflet right away (convert [lng, lat] to [lat, lng])
      const coordinates = data.routes[0].geometry.coordinates;
      const leafletPositions = coordinates.map((coord: [number, number]) => {
        if (Array.isArray(coord) && coord.length === 2) {
          return [coord[1], coord[0]] as [number, number];
        }
        return null;
      }).filter(Boolean) as [number, number][];
      
      console.log(`Pre-processed ${leafletPositions.length} Leaflet positions for MapBox route`);
      
      return {
        route: data.routes[0].geometry,
        duration: data.routes[0].duration, // in seconds
        distance: data.routes[0].distance, // in meters
        steps: data.routes[0].steps || [], // Step-by-step instructions if available
        leafletPositions // Include pre-processed positions for Leaflet
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
  const [tokenAvailable, setTokenAvailable] = useState<boolean | null>(null);
  
  useEffect(() => {
    // Check if token is available on the server side
    fetch('/api/mapbox/check-token')
      .then(response => response.json())
      .then(data => {
        console.log('[MAPBOX] Token availability:', data.available ? 'YES' : 'NO');
        setTokenAvailable(data.available);
      })
      .catch(err => {
        console.log('[MAPBOX] Error checking token:', err);
        setTokenAvailable(false);
      });
  }, []);
  
  const [routeData, setRouteData] = useState<{
    geometry: any;
    duration: number;
    distance: number;
    loading: boolean;
    error: string | null;
    // Add a special field to store raw route positions for Leaflet
    leafletPositions: [number, number][];
  }>({
    geometry: null,
    duration: 0,
    distance: 0,
    loading: false,
    error: null,
    leafletPositions: []
  });
  
  // Use a ref to track whether we've already made a request for these coordinates
  // This prevents the infinite loop in the maximum update depth
  const requestedForRef = useRef<string | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    
    // Only fetch if we have both coordinates
    if (!startCoords || !endCoords) {
      console.log('[MAPBOX] Missing coordinates, cannot fetch route');
      return;
    }
    
    // If token check hasn't completed yet, wait
    if (tokenAvailable === null) {
      console.log('[MAPBOX] Token availability not yet checked');
      return;
    }
    
    // Create a string representation of the coordinates to detect changes
    const coordKey = `${startCoords.lat},${startCoords.lng}|${endCoords.lat},${endCoords.lng}`;
    
    // If we've already requested this exact route, don't request again
    if (requestedForRef.current === coordKey) {
      console.log('[MAPBOX] Already requested this route, using cached data');
      return;
    }
    
    // Mark that we're requesting this route
    requestedForRef.current = coordKey;
    
    // Set the loading state immediately
    setRouteData(prev => ({ ...prev, loading: true, error: null }));
    
    // Add immediate fallback with direct line
    const directLine: [number, number][] = [
      [startCoords.lat, startCoords.lng],
      [endCoords.lat, endCoords.lng]
    ];
    
    // This ensures we always have at least a direct line
    setRouteData(prev => ({
      ...prev,
      leafletPositions: directLine
    }));
    
    const fetchRoute = async () => {
      try {
        // If token is not available, use fallback immediately
        if (!tokenAvailable) {
          console.log('[MAPBOX] Token not available, using fallback route');
          throw new Error('MapBox API token not available');
        }
        
        console.log('[MAPBOX] Fetching route for coordinates:', {
          start: [startCoords.lat, startCoords.lng],
          end: [endCoords.lat, endCoords.lng]
        });
        
        // Format coordinates as lng,lat as required by Mapbox
        const startCoordStr = `${startCoords.lng},${startCoords.lat}`;
        const endCoordStr = `${endCoords.lng},${endCoords.lat}`;
        
        // First try to fetch from the API directly
        const response = await fetch(`/api/mapbox/directions?start=${startCoordStr}&end=${endCoordStr}`);
        
        if (!response.ok) {
          throw new Error(`MapBox API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!isMounted) return; // Safety check
        
        if (!data.routes || data.routes.length === 0) {
          throw new Error('No routes returned from MapBox API');
        }
        
        // Debug the route data structure
        console.log('[MAPBOX] Route data structure:', {
          hasGeometry: !!data.routes[0].geometry,
          geometryType: data.routes[0].geometry?.type,
          coordinatesCount: data.routes[0].geometry?.coordinates?.length,
          hasDistance: !!data.routes[0].distance,
          hasDuration: !!data.routes[0].duration
        });
        
        // Sample the raw routes data for debugging
        console.log('[MAPBOX] Sample raw route coordinates:', 
          data.routes[0].geometry?.coordinates?.slice(0, 3));
        
        // Extract the route coordinates
        const coordinates = data.routes[0].geometry.coordinates;
        
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
          throw new Error('No valid coordinates in MapBox response');
        }
        
        console.log('[MAPBOX] Received', coordinates.length, 'coordinates in route');
        console.log('[MAPBOX] First few coordinates:', coordinates.slice(0, 3));
        
        // Convert from MapBox format [lng, lat] to Leaflet format [lat, lng]
        // and ensure each point is properly formatted
        const leafletPositions: [number, number][] = [];
        
        for (let i = 0; i < coordinates.length; i++) {
          const coord = coordinates[i];
          if (Array.isArray(coord) && coord.length >= 2 && 
              typeof coord[0] === 'number' && !isNaN(coord[0]) &&
              typeof coord[1] === 'number' && !isNaN(coord[1])) {
            // MapBox returns [lng, lat], Leaflet needs [lat, lng]
            leafletPositions.push([coord[1], coord[0]]);
          }
        }
        
        console.log('[MAPBOX] Converted to', leafletPositions.length, 'Leaflet positions');
        if (leafletPositions.length > 0) {
          console.log('[MAPBOX] First position:', leafletPositions[0]);
          console.log('[MAPBOX] Last position:', leafletPositions[leafletPositions.length - 1]);
        }
        
        // Ensure we have enough valid points (at least start and end)
        if (leafletPositions.length < 2) {
          console.warn('[MAPBOX] Not enough valid coordinates found in response');
          // Force add the start and end points from our original request
          leafletPositions.length = 0; // clear any invalid points
          leafletPositions.push([startCoords.lat, startCoords.lng]);
          leafletPositions.push([endCoords.lat, endCoords.lng]);
        }
        
        console.log(`[MAPBOX] Converted ${leafletPositions.length} coordinates for Leaflet display`);
        
        if (leafletPositions.length > 0) {
          // Update the route data with the fetched information
          setRouteData({
            geometry: data.routes[0].geometry,
            duration: data.routes[0].duration || 0,
            distance: data.routes[0].distance || 0,
            loading: false,
            error: null,
            leafletPositions: leafletPositions
          });
          return;
        }
        
        // If no valid leaflet positions, fall back to direct line
        throw new Error('Failed to convert MapBox coordinates to Leaflet format');
      } catch (error) {
        console.error('[MAPBOX] Error:', error);
        
        if (!isMounted) return;
        
        // Create a fallback route using our own function
        const fallbackResult = createStraightLineRoute(
          startCoords.lat,
          startCoords.lng,
          endCoords.lat,
          endCoords.lng
        );
        
        console.log('[MAPBOX] Using fallback direct line with', 
          fallbackResult.leafletPositions.length, 'points');
          
        setRouteData({
          geometry: fallbackResult.route,
          duration: fallbackResult.duration,
          distance: fallbackResult.distance,
          loading: false,
          error: error instanceof Error ? error.message : 'Error fetching route',
          leafletPositions: fallbackResult.leafletPositions
        });
      }
    };
    
    fetchRoute();
    
    return () => {
      isMounted = false;
    };
  }, [startCoords, endCoords, tokenAvailable]);
  
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