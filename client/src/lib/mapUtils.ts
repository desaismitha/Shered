import { useEffect, useState } from 'react';

/**
 * Function to fetch a route from Mapbox Directions API
 * @param startLat Starting latitude
 * @param startLng Starting longitude
 * @param endLat Ending latitude
 * @param endLng Ending longitude
 * @returns A promise that resolves to a GeoJSON LineString of the route
 */
// Fallback token for development purposes only
// In production, this should be removed and proper environment variables used
// Fallback token that should work for basic routes
const HARDCODED_MAPBOX_TOKEN = 'pk.eyJ1Ijoic21pdGhhZGVzYWk5IiwiYSI6ImNsZ2M3dzlsZzAyMnMzZXAyeHRjcjRuYzAifQ.AXK4DhZyv1zL1UJ3WxSf1w';

export async function fetchMapboxRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
  try {
    // Try to use environment variable first, fall back to hardcoded token if not available
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || HARDCODED_MAPBOX_TOKEN;
    
    if (!accessToken) {
      console.error('Mapbox access token is missing. Make sure VITE_MAPBOX_ACCESS_TOKEN is set in environment variables.');
      throw new Error('Mapbox access token is missing');
    }
    
    // Format coordinates as lng,lat as required by Mapbox
    const startCoords = `${startLng},${startLat}`;
    const endCoords = `${endLng},${endLat}`;
    
    // Use server proxy to avoid CORS issues
    const response = await fetch(
      `/api/mapbox/directions?start=${startCoords}&end=${endCoords}&token=${accessToken}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch route: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      return {
        route: data.routes[0].geometry,
        duration: data.routes[0].duration, // in seconds
        distance: data.routes[0].distance, // in meters
      };
    } else {
      throw new Error('No route found');
    }
  } catch (error) {
    console.error('Error fetching route:', error);
    return null;
  }
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
  
  useEffect(() => {
    let isMounted = true;
    
    const fetchRoute = async () => {
      if (!startCoords || !endCoords) {
        return;
      }
      
      setRouteData(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        const result = await fetchMapboxRoute(
          startCoords.lat,
          startCoords.lng,
          endCoords.lat,
          endCoords.lng
        );
        
        if (result && isMounted) {
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