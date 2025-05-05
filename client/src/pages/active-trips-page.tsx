import { useQuery, useMutation } from "@tanstack/react-query";
import { Trip as BaseTrip, ItineraryItem as BaseItineraryItem } from "@shared/schema";

// Extended types to include display properties
type ItineraryItem = BaseItineraryItem & {
  fromLocationDisplay?: string;
  toLocationDisplay?: string;
  locationDisplay?: string;
  isCompleted?: boolean;
};

type Trip = BaseTrip & {
  startLocationDisplay?: string;
  destinationDisplay?: string;
  _accessLevel?: 'owner' | 'member' | null;
};
import { Link, useLocation, useParams } from "wouter";
import { 
  PlusIcon, NavigationIcon, MapPinIcon, ArrowLeft, ArrowRight, 
  Check, Car, PlayCircle, StopCircle, X, MapPin, Info as InfoIcon,
  Clock, Ruler, RefreshCcw, ChevronDown
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateRange, cleanLocationString } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useRef, useState, useMemo } from "react";
import { format } from "date-fns";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useMapboxRoute, formatDuration, formatDistance } from "@/lib/mapUtils";

// Map of known city names to coordinates
const CITY_COORDINATES: Record<string, [number, number]> = {
  'seattle': [47.6062, -122.3321],
  'bellevue': [47.6101, -122.2015],
  'redmond': [47.6740, -122.1215],
  'kirkland': [47.6769, -122.2060],
  'sammamish': [47.6163, -122.0356],
  'issaquah': [47.5301, -122.0326],
  'bothell': [47.7601, -122.2054],
  'woodinville': [47.7543, -122.1635],
  'tacoma': [47.2529, -122.4443],
  'everett': [47.9790, -122.2021],
  'olympia': [47.0379, -122.9007],
  'vancouver': [49.2827, -123.1207], // Vancouver, BC
  'portland': [45.5152, -122.6784],
  'spokane': [47.6588, -117.4260],
  'san francisco': [37.7749, -122.4194],
  'los angeles': [34.0522, -118.2437],
  'san diego': [32.7157, -117.1611],
  'new york': [40.7128, -74.0060],
  'chicago': [41.8781, -87.6298],
  'miami': [25.7617, -80.1918],
  'dallas': [32.7767, -96.7970],
  'houston': [29.7604, -95.3698],
  'denver': [39.7392, -104.9903],
  'phoenix': [33.4484, -112.0740],
  'las vegas': [36.1699, -115.1398],
  'california': [36.7783, -119.4179], // Centralized for the state
  'washington': [47.7511, -120.7401], // Centralized for the state
  'oregon': [43.8041, -120.5542], // Centralized for the state
  'hyd': [17.3850, 78.4867], // Hyderabad coordinates
};

// Function to extract coordinates from a location string (same as in itinerary-form.tsx)
function extractCoordinates(locationStr: string | null | undefined): { lat: number, lng: number } | null {
  if (!locationStr) return null;
  
  console.log("[DEBUG] Extracting coordinates from:", locationStr);
  
  // First try the new format with square brackets [lat, lng] - prioritize this over city lookup
  let coordsRegex = /\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/;
  let match = locationStr.match(coordsRegex);
  
  // If not found, try the old format with parentheses (lat, lng)
  if (!match) {
    coordsRegex = /\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/;
    match = locationStr.match(coordsRegex);
  }
  
  if (match && match.length === 3) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    if (!isNaN(lat) && !isNaN(lng) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180) {
      console.log("[DEBUG] Found embedded coordinates:", lat, lng);
      return { lat, lng };
    }
  }
  
  // Check for exact matches in our city database if no embedded coordinates found
  const normalizedName = locationStr.toLowerCase().trim();
  for (const [cityName, coordinates] of Object.entries(CITY_COORDINATES)) {
    if (normalizedName === cityName || 
        normalizedName.startsWith(cityName + " ") || 
        normalizedName.endsWith(" " + cityName) ||
        normalizedName.includes(" " + cityName + " ")) {
      console.log("[DEBUG] Found city coordinates for:", cityName, coordinates);
      return { lat: coordinates[0], lng: coordinates[1] };
    }
  }
  
  console.log("[DEBUG] No coordinates found for:", locationStr);
  return null;
}

// Function to generate default coordinates for location names
function getDefaultCoordinatesForLocation(
  locationName: string | null, 
  currentLat: number | null | undefined, 
  currentLng: number | null | undefined,
  offset: number
): [number, number] {
  if (!locationName) {
    // Default coordinates if location name is not provided
    return [47.614101, -122.329493]; // Seattle area
  }
  
  // Try to extract coordinates first if they're embedded in the location string
  const coords = extractCoordinates(locationName);
  if (coords) {
    return [coords.lat, coords.lng];
  }
  
  // Check if the location is in our predefined city coordinates map
  const normalizedName = locationName.toLowerCase().trim();
  for (const [cityName, coordinates] of Object.entries(CITY_COORDINATES)) {
    if (normalizedName === cityName || normalizedName.includes(cityName)) {
      // If we're using predefined coordinates, still apply the offset
      return [
        coordinates[0] + (offset * 0.5), 
        coordinates[1] + (offset * 0.5)
      ];
    }
  }
  
  // Use seed-based approach to generate repeatable pseudo-random coordinates
  // This ensures each city name always maps to the same coordinates
  const seed = locationName.toLowerCase().split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  
  // Generate a repeatable "random" number between 0 and 1 based on the seed
  const pseudoRandom = (Math.sin(seed) * 10000) % 1;
  
  // If we have current position, use it as a base and apply a small offset
  if (currentLat && currentLng) {
    return [
      currentLat + offset + (pseudoRandom * 0.02), 
      currentLng + offset + (pseudoRandom * 0.02)
    ];
  }
  
  // Generate coordinates in the general USA region if no current position
  const baseLat = 37 + (pseudoRandom * 10); // ~US latitude range
  const baseLng = -118 + (pseudoRandom * 40); // ~US longitude range
  
  return [baseLat, baseLng];
}

// Function to get status color based on trip status
function getStatusColor(status: string | undefined) {
  if (!status) return "bg-neutral-500";
  
  switch (status.toLowerCase()) {
    case 'planning':
      return "bg-blue-500 hover:bg-blue-600";
    case 'confirmed':
      return "bg-green-500 hover:bg-green-600";
    case 'in-progress':
      return "bg-amber-500 hover:bg-amber-600";
    case 'completed':
      return "bg-purple-500 hover:bg-purple-600";
    case 'cancelled':
      return "bg-red-500 hover:bg-red-600";
    default:
      return "bg-neutral-500 hover:bg-neutral-600";
  }
}

// Map Controller component to fit bounds and update view
function MapController({
  effectiveFromCoords,
  effectiveToCoords,
  currentPosition,
}: {
  effectiveFromCoords: { lat: number, lng: number } | null;
  effectiveToCoords: { lat: number, lng: number } | null;
  currentPosition: [number, number] | null;
}) {
  const map = useMap();

  // Helper function to validate coordinates
  function isValidCoordinate(lat: number, lng: number): boolean {
    return (
      typeof lat === 'number' && 
      typeof lng === 'number' && 
      !isNaN(lat) && 
      !isNaN(lng) && 
      lat >= -90 && 
      lat <= 90 && 
      lng >= -180 && 
      lng <= 180
    );
  }

  useEffect(() => {
    if (!map) return;
    
    try {
      // Collect all valid coordinates
      const bounds: [number, number][] = [];
      
      // Add start/end coordinates with validation
      if (effectiveFromCoords && isValidCoordinate(effectiveFromCoords.lat, effectiveFromCoords.lng)) {
        bounds.push([effectiveFromCoords.lat, effectiveFromCoords.lng]);
      }
      
      if (effectiveToCoords && isValidCoordinate(effectiveToCoords.lat, effectiveToCoords.lng)) {
        bounds.push([effectiveToCoords.lat, effectiveToCoords.lng]);
      }
      
      // Add current position with validation
      if (currentPosition && isValidCoordinate(currentPosition[0], currentPosition[1])) {
        bounds.push(currentPosition);
      }
      
      // If we have at least 2 points, fit the map to those bounds
      if (bounds.length >= 2) {
        map.fitBounds(bounds as L.LatLngBoundsExpression, {
          padding: [70, 70],
          maxZoom: 13,
          animate: true,
          duration: 0.5
        });
      } else if (bounds.length === 1) {
        // If we only have one point, center on it with a closer zoom
        map.setView(bounds[0], 12, { animate: true });
      }
    } catch (error) {
      console.error("Error updating map bounds:", error);
    }
  }, [map, effectiveFromCoords, effectiveToCoords, currentPosition]);

  return null;
}

// Route display component showing the road route
function DirectPolylines({ 
  fromCoords, 
  toCoords, 
  currentCoords,
  mapboxLeafletPositions
}: { 
  fromCoords: [number, number], 
  toCoords: [number, number], 
  currentCoords?: [number, number],
  mapboxLeafletPositions?: [number, number][]
}) {
  // Validate MapBox positions for the road route
  const [validMapboxPositions, setValidMapboxPositions] = useState<[number, number][]>([]);
  
  // Process mapbox route data when available
  useEffect(() => {
    // Skip if no positions are available
    if (!mapboxLeafletPositions || mapboxLeafletPositions.length < 2) {
      return;
    }
    
    // Filter out any invalid positions
    const filtered = mapboxLeafletPositions.filter(pos => {
      return Array.isArray(pos) && 
             pos.length === 2 && 
             typeof pos[0] === 'number' && 
             typeof pos[1] === 'number' &&
             !isNaN(pos[0]) && 
             !isNaN(pos[1]);
    });
    
    // Update state with valid positions if we have enough points
    if (filtered.length > 2) {
      setValidMapboxPositions(filtered);
    }
  }, [mapboxLeafletPositions]);
  
  return (
    <>
      {/* Show MapBox route if available (only the road route) */}
      {validMapboxPositions.length >= 2 && (
        <Polyline 
          key="mapbox-route"
          positions={validMapboxPositions}
          pathOptions={{
            color: '#2563eb',  // Blue-600
            weight: 5,         // Thicker line
            opacity: 0.8,      // Slightly transparent
            lineCap: 'round',  // Rounded line ends
            lineJoin: 'round'  // Rounded line joints
          }}
        />
      )}
      
      {/* Display current position indicator if available */}
      {currentCoords && (
        <CircleMarker
          center={currentCoords}
          radius={6}
          pathOptions={{
            color: '#2563eb',  // Blue-600 (matching the route color)
            weight: 2,
            fillColor: '#60a5fa', // Blue-400 (lighter fill)
            fillOpacity: 0.8
          }}
        />
      )}
    </>
  );
}

// Trip Map Component
function TripMap({
  tripId,
  height = "400px",
  width = "100%",
  startLocation,
  destination,
  currentLatitude,
  currentLongitude,
  mapRef,
  itineraryItem,
}: {
  tripId: number;
  height?: string;
  width?: string;
  startLocation?: string | null;
  destination?: string | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  mapRef?: React.MutableRefObject<L.Map | null>;
  itineraryItem?: ItineraryItem | null;
}) {
  // Extract coordinates from itinerary start and end locations if available
  // Log the itinerary item to debug coordinate extraction
  console.log("Map coordinates extraction - trip data:", {
    startLocation,
    destination,
    itineraryItem,
    currentPosition: currentLatitude && currentLongitude ? { lat: currentLatitude, lng: currentLongitude } : null
  });
  
  // Extract coordinates from itinerary or trip locations
  const fromCoords = itineraryItem?.fromLocation 
    ? extractCoordinates(itineraryItem.fromLocation)
    : extractCoordinates(startLocation);
    
  const toCoords = itineraryItem?.toLocation 
    ? extractCoordinates(itineraryItem.toLocation)
    : extractCoordinates(destination);
    
  console.log("Extracted coordinates:", {fromCoords, toCoords});
  
  // If direct coordinate extraction failed, try to use city database or generate coordinates
  const tryExtractCityCoords = (locationStr: string | null | undefined): {lat: number, lng: number} | null => {
    if (!locationStr) return null;
    
    const normLocation = locationStr.toLowerCase().trim();
    if (CITY_COORDINATES[normLocation]) {
      const coords = CITY_COORDINATES[normLocation];
      return { lat: coords[0], lng: coords[1] };
    }
    return null;
  };
  
  // Handle startLocation and destination as a fallback
    
  // If no itinerary coordinates, use trip start/destination with better fallbacks
  let effectiveFromCoords = fromCoords;
  if (!effectiveFromCoords && startLocation) {
    // First try to extract coordinates
    effectiveFromCoords = extractCoordinates(startLocation);
    
    // If still null, try to look up in our city database
    if (!effectiveFromCoords) {
      const normLocation = startLocation.toLowerCase().trim();
      if (CITY_COORDINATES[normLocation]) {
        const coords = CITY_COORDINATES[normLocation];
        effectiveFromCoords = { lat: coords[0], lng: coords[1] };
        console.log('Using city database coordinates for', startLocation, effectiveFromCoords);
      } else {
        // Last resort fallback
        const defaultCoords = getDefaultCoordinatesForLocation(startLocation, null, null, 0);
        effectiveFromCoords = { 
          lat: defaultCoords[0], 
          lng: defaultCoords[1] 
        };
      }
    }
  }
  
  let effectiveToCoords = toCoords;
  if (!effectiveToCoords && destination) {
    // First try to extract coordinates
    effectiveToCoords = extractCoordinates(destination);
    
    // If still null, try to look up in our city database
    if (!effectiveToCoords) {
      const normLocation = destination.toLowerCase().trim();
      if (CITY_COORDINATES[normLocation]) {
        const coords = CITY_COORDINATES[normLocation];
        effectiveToCoords = { lat: coords[0], lng: coords[1] };
        console.log('Using city database coordinates for', destination, effectiveToCoords);
      } else {
        // Last resort fallback
        const defaultCoords = getDefaultCoordinatesForLocation(destination, null, null, 0);
        effectiveToCoords = { 
          lat: defaultCoords[0], 
          lng: defaultCoords[1] 
        };
      }
    }
  }
  
  // Simple route calculation approach that won't cause any API issues
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
  
  // Calculate route data when effective coordinates change
  useEffect(() => {
    if (!effectiveFromCoords || !effectiveToCoords) {
      return;
    }
    
    setRouteData(prev => ({ ...prev, loading: true }));
    
    // Store coordinates in variables to prevent dependency issues
    const startLat = effectiveFromCoords.lat;
    const startLng = effectiveFromCoords.lng;
    const endLat = effectiveToCoords.lat;
    const endLng = effectiveToCoords.lng;
    
    const calculateRoute = () => {
      try {
        // Calculate distance using Haversine formula
        const R = 6371000; // Earth radius in meters
        const dLat = (endLat - startLat) * Math.PI / 180;
        const dLon = (endLng - startLng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in meters
        
        // Estimate duration: average driving speed 80 km/h
        const duration = distance / 22.2; // 80 km/h = 22.2 m/s
        
        // Create route geometry with intermediate points
        // This creates a more visible polyline on the map
        const numPoints = 10;
        const coordinates: [number, number][] = [];
        
        // Add start point
        coordinates.push([startLng, startLat]);
        
        // Add intermediate points
        for (let i = 1; i < numPoints; i++) {
          const fraction = i / numPoints;
          const lat = startLat + fraction * (endLat - startLat);
          const lng = startLng + fraction * (endLng - startLng);
          coordinates.push([lng, lat]);
        }
        
        // Add end point
        coordinates.push([endLng, endLat]);
        
        const geometry = {
          type: "LineString",
          coordinates: coordinates
        };
        
        // Set the route data
        setRouteData({
          geometry,
          duration,
          distance,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error("Error calculating route:", error);
        setRouteData({
          geometry: null,
          duration: 0,
          distance: 0,
          loading: false,
          error: "Failed to calculate route"
        });
      }
    };
    
    // Use setTimeout to break potential render cycle
    const timer = setTimeout(calculateRoute, 0);
    return () => clearTimeout(timer);
  }, [effectiveFromCoords?.lat, effectiveFromCoords?.lng, effectiveToCoords?.lat, effectiveToCoords?.lng]);
  
  // Destructure route data for easier use
  const { geometry: routeGeometry, duration, distance, loading: isRouteLoading, error: routeError } = routeData;
    
  // Determine the center coordinates for the map
  let centerCoordinates;
  
  if (currentLatitude && currentLongitude) {
    // If we have a current position, center on that
    centerCoordinates = [currentLatitude, currentLongitude];
  } else if (fromCoords) {
    // If we have coordinates from itinerary start location
    centerCoordinates = [fromCoords.lat, fromCoords.lng];
  } else if (toCoords) {
    // If we have coordinates from itinerary end location
    centerCoordinates = [toCoords.lat, toCoords.lng];
  } else if (startLocation) {
    // If we have a trip start location without embedded coordinates
    centerCoordinates = getDefaultCoordinatesForLocation(startLocation, null, null, 0);
  } else if (destination) {
    // If we have a trip destination without embedded coordinates
    centerCoordinates = getDefaultCoordinatesForLocation(destination, null, null, 0);
  } else {
    // Default to Seattle area if nothing is available
    centerCoordinates = [47.6062, -122.3321];
  }
    
  console.log('Map coordinates:', { 
    fromCoords, 
    toCoords, 
    currentCoords: currentLatitude && currentLongitude 
      ? { lat: currentLatitude, lng: currentLongitude } 
      : null 
  });
  
  // Use the MapBox Directions API for route data
  const mapboxRouteData = useMapboxRoute(effectiveFromCoords, effectiveToCoords);
  
  // Destructure the data for easier reference
  const { 
    geometry: mapboxRouteGeometry, 
    duration: mapboxDuration, 
    distance: mapboxDistance, 
    loading: isMapboxRouteLoading, 
    error: mapboxRouteError,
    leafletPositions: mapboxLeafletPositions 
  } = mapboxRouteData;
  
  // Make a manual request to get full route data and use it for display
  const [manualRouteData, setManualRouteData] = useState<[number, number][]>([]);
  
  useEffect(() => {
    let isMounted = true;
    
    if (effectiveFromCoords && effectiveToCoords) {
      const fetchFullRoute = async () => {
        try {
          console.log('[DEBUG] Making direct test request to MapBox API');
          const startCoord = `${effectiveFromCoords.lng},${effectiveFromCoords.lat}`;
          const endCoord = `${effectiveToCoords.lng},${effectiveToCoords.lat}`;
          
          // Use throttled requests to avoid overloading the API
          if (sessionStorage.getItem(`route-${startCoord}-${endCoord}`)) {
            console.log('[DEBUG] Using cached route data');
            const cachedData = JSON.parse(sessionStorage.getItem(`route-${startCoord}-${endCoord}`) || '[]');
            if (isMounted && cachedData && cachedData.length > 2) {
              console.log('[DEBUG] Retrieved', cachedData.length, 'cached coordinates');
              setManualRouteData(cachedData);
              return;
            }
          }
          
          const response = await fetch(`/api/mapbox/directions?start=${startCoord}&end=${endCoord}`);
          const data = await response.json();
          
          if (data && data.routes && data.routes.length > 0 && data.routes[0].geometry && 
              data.routes[0].geometry.coordinates && 
              data.routes[0].geometry.coordinates.length > 0) {
            
            console.log('[DEBUG] Successfully got route data with', 
              data.routes[0].geometry.coordinates.length, 'coordinates');
              
            // Convert from MapBox format [lng, lat] to Leaflet format [lat, lng]
            const leafletPoints = data.routes[0].geometry.coordinates.map((coord: any) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                return [coord[1], coord[0]] as [number, number];
              }
              return null;
            }).filter(Boolean) as [number, number][];
            
            console.log('[DEBUG] Converted to', leafletPoints.length, 'leaflet points');
            if (leafletPoints.length > 2) {
              // Cache the result
              try {
                sessionStorage.setItem(`route-${startCoord}-${endCoord}`, JSON.stringify(leafletPoints));
              } catch (cacheErr) {
                console.warn('[DEBUG] Could not cache route data:', cacheErr);
              }
              
              // Only update if we got more than just start/end points and the component is still mounted
              if (isMounted) {
                setManualRouteData(leafletPoints);
              }
            }
          } else {
            console.log('[DEBUG] No route coordinates found in response');
          }
        } catch (err) {
          console.error('[DEBUG] Error making test request:', err);
        }
      };
      
      fetchFullRoute();
    }
    
    return () => {
      isMounted = false;
    };
  }, [effectiveFromCoords, effectiveToCoords]);
  
  // Debug MapBox route data
  useEffect(() => {
    if (mapboxRouteGeometry) {
      console.log('[MAP] MapBox route geometry received with', 
        mapboxRouteGeometry.coordinates?.length || 0, 'coordinates');
      
      if (mapboxLeafletPositions?.length > 0) {
        console.log('[MAP] Pre-transformed Leaflet positions available with', 
          mapboxLeafletPositions.length, 'points');
        console.log('[MAP] First point:', mapboxLeafletPositions[0]);
        console.log('[MAP] Last point:', mapboxLeafletPositions[mapboxLeafletPositions.length - 1]);
      }
    } else {
      console.log('[MAP] No MapBox route geometry available yet');
    }
    
    // Reset the request cache when the component mounts or coordinates change
    return () => {
      console.log('[MAP] Clearing previous MapBox route request cache');
      // This will help force a refresh when the component remounts
    };
  }, [mapboxRouteGeometry, mapboxLeafletPositions]);
  
  // Here we'll track when the MapBox route data is available
  const [mapBoxRouteReady, setMapBoxRouteReady] = useState(false);
  
  // Check when MapBox data becomes available
  useEffect(() => {
    if (mapboxLeafletPositions && mapboxLeafletPositions.length > 0) {
      console.log('[MAP] MAPBOX ROUTE DATA READY WITH', mapboxLeafletPositions.length, 'POINTS');
      setMapBoxRouteReady(true);
    } else {
      setMapBoxRouteReady(false);
    }
  }, [mapboxLeafletPositions]);
  
  // Process MapBox data for route display
  const roadRoutePositions = useMemo(() => {
    // Check if MapBox data is available
    if (mapboxLeafletPositions && mapboxLeafletPositions.length > 0) {
      console.log('[MAP] Using MapBox route with', mapboxLeafletPositions.length, 'points');
      
      // Ensure coordinates are in Leaflet format [lat, lng]
      const validPositions = mapboxLeafletPositions.filter(pos => {
        return Array.isArray(pos) && 
               pos.length === 2 && 
               typeof pos[0] === 'number' && 
               typeof pos[1] === 'number' &&
               !isNaN(pos[0]) && 
               !isNaN(pos[1]);
      });
      
      if (validPositions.length > 0) {
        console.log('[MAP] Valid MapBox positions:', validPositions.length);
        return validPositions;
      }
    }
    
    // Fallback to direct line
    if (effectiveFromCoords && effectiveToCoords) {
      console.log('[MAP] USING SIMPLIFIED DIRECT LINE ONLY - MapBox data not available');
      return [
        [effectiveFromCoords.lat, effectiveFromCoords.lng],
        [effectiveToCoords.lat, effectiveToCoords.lng]
      ] as [number, number][];
    }
    
    // No coordinates available
    return [];
  }, [effectiveFromCoords, effectiveToCoords, mapboxLeafletPositions, mapBoxRouteReady]);
  
  // Route information panel JSX - We're now using it outside the MapContainer
  const routeInfoPanel = useMemo(() => {
    return (
      <div className="mb-2 bg-white p-3 rounded-md border border-gray-300 shadow-sm w-full">
        <div className="text-sm font-bold mb-1">Route Information</div>
        {isMapboxRouteLoading ? (
          <div className="text-xs text-gray-600">Loading route information...</div>
        ) : mapboxRouteError ? (
          <div className="text-xs text-red-500">Error calculating route</div>
        ) : mapboxDistance > 0 && mapboxDuration > 0 ? (
          <div className="flex justify-between">
            <div className="flex items-center mb-1 text-xs">
              <Clock size={14} className="mr-1 text-blue-500" />
              <span>Travel Time: {formatDuration(mapboxDuration)}</span>
            </div>
            <div className="flex items-center text-xs">
              <Ruler size={14} className="mr-1 text-blue-500" />
              <span>Distance: {formatDistance(mapboxDistance, true)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600">
            Route information will appear when start and end locations are available
          </div>
        )}
      </div>
    );
  }, [isMapboxRouteLoading, mapboxRouteError, mapboxDistance, mapboxDuration]);
  
  return (
    <div style={{ height, width }}>
      {/* Route Information Panel - Positioned above map */}
      {typeof window !== 'undefined' && routeInfoPanel}
      
      {typeof window !== 'undefined' && (
        <MapContainer
          center={centerCoordinates as [number, number]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          ref={(map) => {
            if (map && mapRef) {
              mapRef.current = map;
            }
          }}
        >
          {/* Direct Polyline Route - Guaranteed to work */}
          {effectiveFromCoords && effectiveToCoords && (
            <DirectPolylines
              fromCoords={[effectiveFromCoords.lat, effectiveFromCoords.lng]}
              toCoords={[effectiveToCoords.lat, effectiveToCoords.lng]}
              currentCoords={currentLatitude && currentLongitude ? [currentLatitude, currentLongitude] : undefined}
              mapboxLeafletPositions={mapboxLeafletPositions}
            />
          )}
          
          {/* Show the actual road route from our direct test fetch */}
          {manualRouteData.length > 2 && (
            <Polyline 
              positions={manualRouteData}
              pathOptions={{
                color: '#2563eb',  // Blue-600
                weight: 5,         // Thicker line
                opacity: 0.8,      // Slightly transparent
                lineCap: 'round',  // Rounded line ends
                lineJoin: 'round'  // Rounded line joints
              }}
            />
          )}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Show marker for itinerary start location if coordinates are available */}
          {fromCoords && (
            <Marker 
              position={[fromCoords.lat, fromCoords.lng]}
              icon={new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <strong>Start: {cleanLocationString(itineraryItem?.fromLocation) || 'Starting Point'}</strong><br />
                  <span>Starting point of the itinerary</span>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show marker for trip start location if itinerary start location not available */}
          {!fromCoords && effectiveFromCoords && (
            <Marker 
              position={[effectiveFromCoords.lat, effectiveFromCoords.lng]}
              icon={new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <strong>Start: {cleanLocationString(startLocation)}</strong><br />
                  <span>Starting point of the trip</span>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show marker for itinerary end location if coordinates are available */}
          {toCoords && (
            <Marker 
              position={[toCoords.lat, toCoords.lng]}
              icon={new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <strong>Destination: {cleanLocationString(itineraryItem?.toLocation) || 'Destination'}</strong><br />
                  <span>End point of the itinerary</span>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show marker for trip destination if itinerary end location not available */}
          {!toCoords && effectiveToCoords && (
            <Marker 
              position={[effectiveToCoords.lat, effectiveToCoords.lng]}
              icon={new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <strong>Destination: {cleanLocationString(destination)}</strong><br />
                  <span>Final destination of the trip</span>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show marker for current location */}
          {currentLatitude && currentLongitude && (
            <Marker 
              position={[currentLatitude, currentLongitude]}
              icon={new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div>
                  <strong>Current Location</strong><br />
                  <span>Last updated: {new Date().toLocaleString()}</span>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Show notice if Mapbox API key is missing (no longer needed with fallback approach) */}
          {false && (
            <div className="leaflet-top leaflet-left" style={{
              backgroundColor: 'white',
              padding: '8px',
              margin: '10px',
              borderRadius: '4px',
              border: '1px solid #f59e0b',
              boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
              zIndex: 1000
            }}>
              <div className="leaflet-control text-amber-600">
                <div className="flex items-center">
                  <InfoIcon size={16} className="mr-1" />
                  <span>Mapbox directions unavailable - API key needed</span>
                </div>
              </div>
            </div>
          )}
          
          {/* All polylines are now handled by the DirectPolylines component above */}
          
          {/* We're not drawing these lines anymore - using the simplified approach above instead */}
          
          {/* We've centralized all polyline drawing in the roadRoutePositions section above */}
          
          {/* Loading indicator for route information */}
          {isRouteLoading && (
            <div className="leaflet-top leaflet-left" style={{
              backgroundColor: 'white',
              padding: '8px',
              margin: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
              zIndex: 1000
            }}>
              <div className="leaflet-control">
                <div className="flex items-center">
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <span>Loading route information...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Error display for route information */}
          {routeError && (
            <div className="leaflet-top leaflet-left" style={{
              backgroundColor: 'white',
              padding: '8px',
              margin: '10px',
              borderRadius: '4px',
              border: '1px solid #f87171',
              boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
              zIndex: 1000
            }}>
              <div className="leaflet-control text-red-500">
                <div className="flex items-center">
                  <X size={16} className="mr-1" />
                  <span>Couldn't load route directions</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Route Information */}
          {!isRouteLoading && !routeError && distance > 0 && duration > 0 && (
            <div className="leaflet-top leaflet-right" style={{
              backgroundColor: 'white',
              padding: '8px',
              margin: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
              zIndex: 1000,
              width: '180px'
            }}>
              <div className="leaflet-control">
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Route Information</div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                  <Clock size={14} className="mr-1" />
                  <span>Travel Time: {formatDuration(duration)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Ruler size={14} className="mr-1" />
                  <span>Distance: {formatDistance(distance, true)}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Add the map controller to update bounds */}
          <MapController 
            effectiveFromCoords={effectiveFromCoords} 
            effectiveToCoords={effectiveToCoords}
            currentPosition={currentLatitude && currentLongitude ? [currentLatitude, currentLongitude] : null}
          />
          
          {/* Map Legend */}
          <div className="leaflet-bottom leaflet-left" style={{
            backgroundColor: 'white',
            padding: '10px',
            margin: '10px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            zIndex: 1000
          }}>
            <div className="leaflet-control" style={{
              fontSize: '12px',
              lineHeight: '20px'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '5px' }}>Map Legend</div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ width: '20px', height: '4px', backgroundColor: '#2563eb', marginRight: '8px', borderRadius: '2px' }}></div>
                <span>Road Route</span>
              </div>
              {/* Direct line reference removed */}
              {currentLatitude && currentLongitude && (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#60a5fa', border: '2px solid #2563eb', marginRight: '8px' }}></div>
                  <span>Current Position</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'white', border: '2px solid green', marginRight: '8px' }}></div>
                <span>Start Location</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'white', border: '2px solid red', marginRight: '8px' }}></div>
                <span>Destination</span>
              </div>
            </div>
          </div>
        </MapContainer>
      )}
    </div>
  );
}

export default function ActiveTripsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams();
  
  // State for trip tracking
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [showTrackingView, setShowTrackingView] = useState(false);
  const [showItinerarySelector, setShowItinerarySelector] = useState(false);
  const [selectedItineraryIds, setSelectedItineraryIds] = useState<number[]>([]);
  const [selectedItineraryItems, setSelectedItineraryItems] = useState<ItineraryItem[]>([]);
  const [currentItineraryStep, setCurrentItineraryStep] = useState(0);
  const [isCompletingItineraryItem, setIsCompletingItineraryItem] = useState(false);
  const [showCompletionConfirmDialog, setShowCompletionConfirmDialog] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [isLocationUpdating, setIsLocationUpdating] = useState(false);
  const [locationUpdateError, setLocationUpdateError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<PermissionState | 'unknown'>('unknown');
  
  // Map reference for Leaflet
  const mapRef = useRef<L.Map | null>(null);

  // Effect to check geolocation permissions
  useEffect(() => {
    // Check if the browser supports the permissions API
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(permissionStatus => {
          setLocationPermission(permissionStatus.state);
          
          // Add listener for permission changes
          permissionStatus.onchange = () => {
            setLocationPermission(permissionStatus.state);
          };
        })
        .catch(error => {
          console.error('Error checking location permission:', error);
          // Default to unknown if we can't check
          setLocationPermission('unknown');
        });
    } else {
      console.log('Permissions API not supported');
      setLocationPermission('unknown');
    }
  }, []);

  // Effect to handle URL parameters for direct linking
  useEffect(() => {
    // Parse URL query parameters
    const searchParams = new URLSearchParams(window.location.search);
    const tripIdParam = searchParams.get('tripId');
    const itemIdParam = searchParams.get('itemId');
    
    console.log("URL parameters:", { tripIdParam, itemIdParam });
    
    if (tripIdParam) {
      const parsedTripId = parseInt(tripIdParam);
      if (!isNaN(parsedTripId)) {
        setSelectedTripId(parsedTripId);
        setShowTrackingView(true);
        
        // If there's also an itinerary item ID, store it
        if (itemIdParam) {
          const parsedItemId = parseInt(itemIdParam);
          if (!isNaN(parsedItemId)) {
            setSelectedItemId(parsedItemId);
            // We'll handle the actual item selection after the trip data loads
          }
        }
      }
    }
  }, []);

  // Query to fetch active trips
  const { data: activeTrips, isLoading, error, refetch: refetchActiveTrips } = useQuery<Trip[]>({
    queryKey: ["/api/trips/active"],
    enabled: !!user,
  });
  
  // Get selected trip if a tripId is selected
  const { data: selectedTrip, isLoading: isLoadingSelectedTrip } = useQuery<Trip>({
    queryKey: ["/api/trips", selectedTripId],
    enabled: !!selectedTripId,
  });

  // Get all itinerary items for the selected trip, even outside of the selector dialog
  const { data: allItineraryItems, isLoading: isLoadingAllItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/trips", selectedTripId, "itinerary"],
    enabled: !!selectedTripId,
  });
  
  // Get itinerary items for selected trip (only used in selector dialog)
  const { data: itineraryItems, isLoading: isLoadingItinerary } = useQuery<ItineraryItem[]>({
    queryKey: ["/api/trips", selectedTripId, "itinerary"],
    enabled: !!selectedTripId && showItinerarySelector,
  });
  
  // Define a type for route group
  type RouteGroup = {
    destination: string;
    items: ItineraryItem[];
    count: number;
  };
  
  // Group itinerary items by route (based on common destinations)
  const routeOptionGroups = useMemo<RouteGroup[]>(() => {
    if (!itineraryItems || itineraryItems.length === 0) return [];
    
    // Group by destination
    const routesByDestination: Record<string, ItineraryItem[]> = {};
    
    itineraryItems.forEach((item: ItineraryItem) => {
      const destination = item.toLocation || 'unknown';
      if (!routesByDestination[destination]) {
        routesByDestination[destination] = [];
      }
      routesByDestination[destination].push(item);
    });
    
    // Convert to array of route options
    return Object.entries(routesByDestination).map(([destination, items]: [string, ItineraryItem[]]) => ({
      destination,
      items,
      count: items.length
    }));
  }, [itineraryItems]);
  
  // Effect to auto-start trip with a specific itinerary item if it's in the URL
  useEffect(() => {
    // If we have a selectedItemId and we've loaded the trip's itinerary items
    if (selectedItemId && allItineraryItems && allItineraryItems.length > 0 && selectedTrip) {
      console.log("Ready to auto-start trip with item ID:", selectedItemId);
      
      // Find the itinerary item
      const itineraryItem = allItineraryItems.find(item => item.id === selectedItemId);
      
      if (itineraryItem) {
        console.log("Found itinerary item:", itineraryItem);
        
        // If trip is not already in progress, start it with just this item
        if (selectedTrip.status !== 'in-progress') {
          // Set the selected itinerary IDs to include just this item
          setSelectedItineraryIds([selectedItemId]);
          
          // Start the trip tracking
          startTripMutation.mutate();
        } else {
          // Trip is already in progress, just show the tracking view
          console.log("Trip already in progress, showing tracking view");
          toast({
            title: "Trip In Progress",
            description: "This trip is already being tracked. You can update your location or complete the trip.",
          });
        }
        
        // Clear the selectedItemId so this only runs once
        setSelectedItemId(null);
      }
    }
  }, [selectedItemId, allItineraryItems, selectedTrip]);
  
  // Trip tracking mutations
  const startTripMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTripId) throw new Error("No trip selected");
      
      const res = await apiRequest("POST", `/api/trips/${selectedTripId}/start`, {
        itineraryIds: selectedItineraryIds.length > 0 ? selectedItineraryIds : undefined
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trip started",
        description: "Trip tracking has been started successfully!"
      });
      
      // Store the selected itinerary items for step-by-step tracking
      if (data.selectedItineraryItems && data.selectedItineraryItems.length > 0) {
        // Sort items by day
        const items = [...data.selectedItineraryItems];
        items.sort((a, b) => a.day - b.day);
        
        // Initialize each item with isCompleted property set to false
        const itemsWithCompletionStatus = items.map(item => ({ 
          ...item, 
          isCompleted: false 
        }));
        
        setSelectedItineraryItems(itemsWithCompletionStatus);
        setCurrentItineraryStep(0);
      }
      
      // Close the dialog
      setShowItinerarySelector(false);
      
      // Update the UI
      queryClient.invalidateQueries({ queryKey: ["/api/trips", selectedTripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/active"] });
    },
    onError: (error) => {
      toast({
        title: "Error starting trip",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const updateLocationMutation = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      if (!selectedTripId) throw new Error("No trip selected");
      
      console.log("Updating location with coordinates:", coords);
      
      // Validate coordinates
      if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
        throw new Error("Invalid coordinates: latitude and longitude must be numbers");
      }
      
      try {
        const res = await apiRequest("POST", `/api/trips/${selectedTripId}/update-location`, coords);
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Server error: ${res.status}`);
        }
        
        return await res.json();
      } catch (error) {
        console.error("Location update error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Location updated successfully:", data);
      
      // Check if the response includes route deviation information
      if (data.deviation && !data.routeStatus?.isOnRoute) {
        // Show route deviation notification
        toast({
          title: "Route Deviation Detected!",
          description: data.deviation.message || `You are ${data.routeStatus?.distanceFromRoute.toFixed(2)}km away from the planned route`,
          variant: "destructive",
          duration: 10000 // longer duration for important alerts
        });
        
        // You could also play a sound or show a more prominent alert
        // In a production app, this would also notify other trip members
      } else {
        // Regular update notification
        toast({
          title: "Location updated",
          description: "Your current location has been updated"
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/trips", selectedTripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/active"] });
    },
    onError: (error) => {
      setLocationUpdateError(error.message);
      toast({
        title: "Location update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const completeTripMutation = useMutation({
    mutationFn: async (options?: { confirmComplete?: boolean }) => {
      if (!selectedTripId) throw new Error("No trip selected");
      
      const payload = {
        confirmComplete: options?.confirmComplete || false,
        currentItineraryStep,
        totalItinerarySteps: selectedItineraryItems.length
      };
      const res = await apiRequest("POST", `/api/trips/${selectedTripId}/complete`, payload);
      
      if (!res.ok) {
        const errorData = await res.json();
        
        // Check if this is a "remaining items" error that requires confirmation
        if (errorData.requireConfirmation) {
          setCompletionError(`You still have ${errorData.totalSteps - errorData.currentStep - 1} itinerary items that haven't been visited yet. Do you want to complete the trip anyway?`);
          setShowCompletionConfirmDialog(true);
          throw new Error(errorData.error);
        }
        
        throw new Error(errorData.error || "Failed to complete trip");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trip completed",
        description: "Trip has been marked as completed!"
      });
      setShowCompletionConfirmDialog(false);
      setShowTrackingView(false);
      setSelectedTripId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/trips", selectedTripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/active"] });
    },
    onError: (error) => {
      // Only show error toast if it's not the special confirmation error
      if (!showCompletionConfirmDialog) {
        toast({
          title: "Error completing trip",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  });
  
  // Function to toggle the completion status of a specific itinerary item
  const handleToggleItineraryItemCompletion = (itemId: number) => {
    if (isCompletingItineraryItem) return;
    
    setIsCompletingItineraryItem(true);
    
    // Update the local state immediately for a responsive UI
    setSelectedItineraryItems(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, isCompleted: !item.isCompleted } 
          : item
      )
    );
    
    // Simulate a delay to show the completing state
    setTimeout(() => {
      setIsCompletingItineraryItem(false);
      
      // If all items are completed, you could suggest completing the trip
      const allCompleted = selectedItineraryItems.every(item => 
        item.id === itemId 
          ? !item.isCompleted // Use the new value (opposite of current)
          : item.isCompleted === true
      );
      
      if (allCompleted) {
        toast({
          title: "All items completed",
          description: "You've completed all itinerary items. You can now complete the trip.",
        });
      }
    }, 500);
  };
  
  // Function to start trip tracking
  const handleStartTracking = () => {
    if (!selectedTripId) return;
    
    // If there are itinerary items, show the selector dialog
    if (itineraryItems && itineraryItems.length > 0) {
      setShowItinerarySelector(true);
    } else {
      // If no itinerary items, just start tracking
      startTripMutation.mutate();
    }
  };
  
  // Function to complete trip
  const handleCompleteTrip = () => {
    completeTripMutation.mutate({});
  };
  
  // Function to update current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationUpdateError("Geolocation is not supported by your browser");
      return;
    }
    
    // Check if permission is denied before attempting to get location
    if (locationPermission === 'denied') {
      setLocationUpdateError("Location permission is denied. Please enable location access in your browser settings.");
      toast({
        title: "Location permission denied",
        description: "Please enable location access in your browser settings to track your trip.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLocationUpdating(true);
    setLocationUpdateError(null);
    
    // Set a timeout to prevent the UI from freezing if the permission dialog is ignored
    const locationTimeout = setTimeout(() => {
      setIsLocationUpdating(false);
      setLocationUpdateError("Location request timed out. Please check your location permissions.");
    }, 15000);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(locationTimeout);
        const { latitude, longitude } = position.coords;
        
        // Update the map center if map is available
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 13);
        }
        
        // Send the location update to the server
        updateLocationMutation.mutate({ latitude, longitude });
        setIsLocationUpdating(false);
      },
      (error) => {
        clearTimeout(locationTimeout);
        console.error("Error getting location:", error);
        setIsLocationUpdating(false);
        
        // Handle different error types
        let errorMessage = "";
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            setLocationPermission('denied');
            errorMessage = "You denied the request for geolocation. Please enable location access in your browser settings.";
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = "Location information is unavailable. Check if you're in an area with GPS coverage.";
            break;
          case 3: // TIMEOUT
            errorMessage = "The request to get your location timed out. Try again or check your device settings.";
            break;
          default:
            errorMessage = `Error getting location: ${error.message}`;
        }
        
        setLocationUpdateError(errorMessage);
        
        toast({
          title: "Location error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };
  
  // Handle view trip tracking
  const handleViewTripTracking = (tripId: number) => {
    setSelectedTripId(tripId);
    setShowTrackingView(true);
  };
  
  // Back to trips list
  const handleBackToList = () => {
    setShowTrackingView(false);
    setSelectedTripId(null);
  };
  
  if (error) {
    toast({
      title: "Error fetching active trips",
      description: "There was a problem loading your active trips. Please try again.",
      variant: "destructive",
    });
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showTrackingView && selectedTrip ? (
          // Detailed tracking view for selected trip
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <Button
                  variant="outline"
                  onClick={handleBackToList}
                  className="mb-4"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Active Trips
                </Button>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {selectedTrip.name}
                  <Badge className={`ml-2 ${getStatusColor(selectedTrip.status || '')}`}>
                    {(selectedTrip.status || 'unknown').charAt(0).toUpperCase() + (selectedTrip.status || 'unknown').slice(1)}
                  </Badge>
                </h1>
                <p className="text-neutral-500 mt-1">
                  Track your journey from {selectedTrip.startLocation || "Starting Point"} to {selectedTrip.destination || "Destination"}
                </p>
              </div>
              
              {/* Trip controls based on status */}
              {selectedTrip.status === 'in-progress' ? (
                <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    onClick={getCurrentLocation}
                    disabled={isLocationUpdating}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <NavigationIcon className="h-4 w-4 mr-2" />
                    {isLocationUpdating ? 'Updating...' : 'Update Location'}
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleCompleteTrip}
                    disabled={completeTripMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {completeTripMutation.isPending ? 'Completing...' : 'Complete Trip'}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 md:mt-0">
                  <Button
                    variant="default"
                    onClick={handleStartTracking}
                    disabled={startTripMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    {startTripMutation.isPending ? 'Starting Trip...' : 'Start Trip'}
                  </Button>
                </div>
              )}
            </div>
            
            {/* Error messages */}
            {locationUpdateError && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Error updating location</AlertTitle>
                <AlertDescription>{locationUpdateError}</AlertDescription>
              </Alert>
            )}
            
            {/* Trip status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Trip Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-background border rounded-lg p-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Distance Traveled</h3>
                      <p className="text-lg font-medium">
                        {selectedTrip.distanceTraveled ? `${selectedTrip.distanceTraveled.toFixed(2)} km` : 'Not started'}
                      </p>
                    </div>
                    
                    <div className="bg-background border rounded-lg p-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h3>
                      <p className="text-lg font-medium">
                        {selectedTrip.lastLocationUpdate 
                          ? format(new Date(selectedTrip.lastLocationUpdate), 'MMM d, yyyy HH:mm:ss')
                          : 'Not started'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Current Itinerary Details</CardTitle>
                      {selectedItineraryItems.length > 0 && currentItineraryStep < selectedItineraryItems.length && (
                        <CardDescription>
                          {selectedItineraryItems[currentItineraryStep].title} (Step {currentItineraryStep + 1} of {selectedItineraryItems.length})
                        </CardDescription>
                      )}
                    </div>
                    {selectedItineraryItems.length > 0 && currentItineraryStep < selectedItineraryItems.length && (
                      <div>
                        <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                          In Progress
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedItineraryItems.length > 0 && currentItineraryStep < selectedItineraryItems.length ? (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="bg-background border rounded-lg p-4">
                        <div className="flex flex-col mb-4">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{selectedTrip.name}</h3>
                            <div>
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                Active Trip
                              </Badge>
                            </div>
                          </div>
                          <div className="border-b pb-2 mt-2">
                            <div className="flex items-center">
                              <span className="font-medium mr-2 text-sm">Currently active:</span>
                              <span className="text-sm font-semibold text-primary">
                                {selectedItineraryItems[currentItineraryStep].title}
                              </span>
                            </div>
                            <div className="mt-1 text-sm flex items-center">
                              <span className="text-muted-foreground mr-1">Itinerary route:</span>
                              <span className="font-medium">
                                {selectedItineraryItems[currentItineraryStep].fromLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].fromLocation) || "Start"} → {selectedItineraryItems[currentItineraryStep].toLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].toLocation) || "End"}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {selectedItineraryItems[currentItineraryStep].description && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {selectedItineraryItems[currentItineraryStep].description}
                          </p>
                        )}
                        
                        <div className="flex flex-col sm:flex-row justify-between gap-4 mt-2">
                          {(selectedItineraryItems[currentItineraryStep].fromLocation || selectedItineraryItems[currentItineraryStep].location) && (
                            <div className="border rounded-md p-3 bg-green-50 flex-1">
                              <h3 className="text-sm font-medium text-green-800 mb-1">Start Location</h3>
                              <p className="text-md font-medium flex items-center">
                                <MapPin className="h-4 w-4 text-green-600 mr-1" />
                                {selectedItineraryItems[currentItineraryStep].fromLocationDisplay || 
                                 cleanLocationString(selectedItineraryItems[currentItineraryStep].fromLocation) || 
                                 cleanLocationString(selectedItineraryItems[currentItineraryStep].location) || 'Not specified'}
                              </p>
                            </div>
                          )}
                          
                          {(selectedItineraryItems[currentItineraryStep].toLocation) && (
                            <div className="border rounded-md p-3 bg-red-50 flex-1">
                              <h3 className="text-sm font-medium text-red-800 mb-1">End Location</h3>
                              <p className="text-md font-medium flex items-center">
                                <MapPin className="h-4 w-4 text-red-600 mr-1" />
                                {selectedItineraryItems[currentItineraryStep].toLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].toLocation) || 'Not specified'}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Day: </span>
                            <span className="font-medium">{selectedItineraryItems[currentItineraryStep].day}</span>
                          </div>
                          {selectedItineraryItems[currentItineraryStep].startTime && (
                            <div>
                              <span className="text-muted-foreground">Time: </span>
                              <span className="font-medium">{selectedItineraryItems[currentItineraryStep].startTime}</span>
                              {selectedItineraryItems[currentItineraryStep].endTime && (
                                <> - {selectedItineraryItems[currentItineraryStep].endTime}</>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="bg-background border rounded-lg p-4">
                        {/* Show trip information when no itinerary item is selected */}
                        <div className="border-b pb-2 mb-3">
                          <h3 className="text-sm font-semibold">{selectedTrip.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            Overall trip: {selectedTrip.startLocationDisplay || cleanLocationString(selectedTrip.startLocation) || "Unknown"} to {selectedTrip.destinationDisplay || cleanLocationString(selectedTrip.destination) || "Unknown"}
                          </p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row justify-between gap-4">
                          <div className="border rounded-md p-3 bg-green-50 flex-1">
                            <h3 className="text-sm font-medium text-green-800 mb-1">Trip Start</h3>
                            <p className="text-md font-medium flex items-center">
                              <MapPin className="h-4 w-4 text-green-600 mr-1" />
                              {selectedTrip.startLocationDisplay || cleanLocationString(selectedTrip.startLocation) || 'Not specified'}
                            </p>
                          </div>
                          <div className="border rounded-md p-3 bg-red-50 flex-1">
                            <h3 className="text-sm font-medium text-red-800 mb-1">Trip End</h3>
                            <p className="text-md font-medium flex items-center">
                              <MapPin className="h-4 w-4 text-red-600 mr-1" />
                              {selectedTrip.destinationDisplay || cleanLocationString(selectedTrip.destination) || 'Not specified'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Map */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Trip Map</CardTitle>
                {selectedItineraryItems.length > 0 && currentItineraryStep < selectedItineraryItems.length ? (
                  <CardDescription>
                    Showing route from {selectedItineraryItems[currentItineraryStep].fromLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].fromLocation) || "Starting Point"} to {selectedItineraryItems[currentItineraryStep].toLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].toLocation) || "Destination"}
                  </CardDescription>
                ) : (
                  <CardDescription>
                    Showing overall trip from {selectedTrip.startLocationDisplay || cleanLocationString(selectedTrip.startLocation) || "Starting Point"} to {selectedTrip.destinationDisplay || cleanLocationString(selectedTrip.destination) || "Destination"}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="h-96 w-full rounded-md overflow-hidden border">
                  <TripMap 
                    tripId={selectedTrip.id}
                    height="100%"
                    width="100%"
                    startLocation={selectedTrip.startLocation}
                    destination={selectedTrip.destination}
                    currentLatitude={selectedTrip.currentLatitude}
                    currentLongitude={selectedTrip.currentLongitude}
                    mapRef={mapRef}
                    itineraryItem={selectedItineraryItems.length > 0 && currentItineraryStep < selectedItineraryItems.length 
                      ? selectedItineraryItems[currentItineraryStep] 
                      : null}
                  />
                </div>
              </CardContent>
              {/* Route Guidance Legend */}
              <div className="px-6 pb-4 border-t border-border mt-2 pt-3">
                <h4 className="text-sm font-semibold mb-2">Route Guidance</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="flex items-center">
                    <div className="w-6 h-2 mr-2" style={{ backgroundColor: '#4a90e2', borderTop: '2px dashed white' }}></div>
                    <span>Planned Route</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-2 bg-[#34c759] mr-2"></div>
                    <span>Traveled Path</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-2 mr-2" style={{ backgroundColor: '#ff9500', borderTop: '2px dashed white' }}></div>
                    <span>Remaining Route</span>
                  </div>
                </div>
              </div>
            </Card>
            
            {/* Itinerary progress section (if items are selected) */}
            {selectedTrip.status === 'in-progress' && selectedItineraryItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Itinerary Progress</CardTitle>
                  <CardDescription>
                    Step {currentItineraryStep + 1} of {selectedItineraryItems.length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedItineraryItems[currentItineraryStep] && (
                    <div className="border rounded-md p-4 bg-primary-50">
                      <div className="flex items-start gap-4">
                        <div className="bg-primary-100 rounded-full p-2 text-primary-800">
                          {selectedItineraryItems[currentItineraryStep].fromLocation && 
                           selectedItineraryItems[currentItineraryStep].toLocation ? (
                            <Car className="h-6 w-6" />
                          ) : (
                            <MapPin className="h-6 w-6" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg mb-1">
                            {selectedItineraryItems[currentItineraryStep].title}
                          </h4>
                          
                          {selectedItineraryItems[currentItineraryStep].description && (
                            <p className="text-neutral-700 mb-2">{selectedItineraryItems[currentItineraryStep].description}</p>
                          )}
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-neutral-500">Day: </span>
                              <span className="font-medium">{selectedItineraryItems[currentItineraryStep].day}</span>
                            </div>
                            
                            {selectedItineraryItems[currentItineraryStep].location && (
                              <div>
                                <span className="text-neutral-500">Location: </span>
                                <span className="font-medium">{cleanLocationString(selectedItineraryItems[currentItineraryStep].location)}</span>
                              </div>
                            )}
                            
                            {selectedItineraryItems[currentItineraryStep].fromLocation && selectedItineraryItems[currentItineraryStep].toLocation && (
                              <div className="sm:col-span-2">
                                <span className="text-neutral-500">Travel: </span>
                                <span className="font-medium">
                                  {selectedItineraryItems[currentItineraryStep].fromLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].fromLocation)} to {selectedItineraryItems[currentItineraryStep].toLocationDisplay || cleanLocationString(selectedItineraryItems[currentItineraryStep].toLocation)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between mt-4 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentItineraryStep(prev => Math.max(0, prev - 1))}
                            disabled={currentItineraryStep === 0}
                          >
                            <ArrowLeft className="h-4 w-4 mr-1" /> Previous
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-primary-50 hover:bg-primary-100 border-primary-200"
                            onClick={getCurrentLocation}
                            disabled={isLocationUpdating}
                          >
                            <NavigationIcon className="h-4 w-4 mr-1" />
                            {isLocationUpdating ? 'Updating...' : 'Update Location'}
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (currentItineraryStep < selectedItineraryItems.length - 1) {
                                setCurrentItineraryStep(prev => prev + 1);
                              }
                            }}
                            disabled={currentItineraryStep === selectedItineraryItems.length - 1}
                          >
                            Next <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                        
                        {/* Mark itinerary item as completed button */}
                        <div className="flex justify-center">
                          <Button
                            variant={selectedItineraryItems[currentItineraryStep].isCompleted ? "ghost" : "outline"}
                            size="sm"
                            className={selectedItineraryItems[currentItineraryStep].isCompleted 
                              ? "bg-green-50 text-green-700 hover:bg-green-100 border-green-200" 
                              : "bg-background border-dashed"
                            }
                            onClick={() => handleToggleItineraryItemCompletion(selectedItineraryItems[currentItineraryStep].id)}
                          >
                            {selectedItineraryItems[currentItineraryStep].isCompleted ? (
                              <>
                                <Check className="h-4 w-4 mr-1 text-green-600" />
                                Completed
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Mark as Completed
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          // Active trips list view
          <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">
                  Active Trips
                </h1>
                <p className="text-neutral-500 mt-1">
                  Monitor and track your in-progress trips
                </p>
              </div>
              <div className="mt-4 md:mt-0">
                <Button
                  onClick={() => navigate("/trips/new")}
                  className="inline-flex items-center"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Trip
                </Button>
              </div>
            </div>

            {isLoading ? (
              // Loading skeleton
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="h-48 bg-neutral-100 relative">
                      <Skeleton className="w-full h-full" />
                    </div>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-2/3" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-10 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : activeTrips && activeTrips.length > 0 ? (
              // Display active trips
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTrips.map((trip) => (
                  <Card 
                    key={trip.id} 
                    className={`overflow-hidden h-full flex flex-col ${selectedTripId === trip.id ? 'ring-2 ring-primary-500 shadow-lg' : ''}`}
                  >
                    <div className="h-48 bg-neutral-100 relative">
                      {trip.imageUrl ? (
                        <img 
                          src={trip.imageUrl} 
                          alt={trip.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary-50">
                          <MapPinIcon className="h-12 w-12 text-primary-200" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <Badge className="bg-primary-500">
                          In Progress
                        </Badge>
                      </div>
                      {selectedTripId === trip.id && (
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-green-500 flex items-center gap-1">
                            <ActivityIcon className="h-3 w-3" />
                            Tracking
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardHeader>
                      <CardTitle>{trip.name}</CardTitle>
                      <CardDescription>
                        {trip.destinationDisplay || (trip.destination ? cleanLocationString(trip.destination) : "No destination specified")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="text-sm text-neutral-600">
                        <p className="flex items-center">
                          <span className="font-medium mr-2">Dates:</span>
                          {formatDateRange(trip.startDate, trip.endDate)}
                        </p>
                        {trip.startLocation && (
                          <p className="flex items-center mt-2">
                            <span className="font-medium mr-2">From:</span>
                            <span className="text-neutral-800">{trip.startLocationDisplay || cleanLocationString(trip.startLocation)}</span>
                          </p>
                        )}
                        {trip.destination && (
                          <p className="flex items-center mt-2">
                            <span className="font-medium mr-2">To:</span>
                            <span className="text-neutral-800">{trip.destinationDisplay || cleanLocationString(trip.destination)}</span>
                          </p>
                        )}
                        {trip.currentLatitude && trip.currentLongitude && (
                          <p className="flex items-center mt-2">
                            <span className="font-medium mr-2">Last Update:</span>
                            {trip.lastLocationUpdate ? new Date(trip.lastLocationUpdate).toLocaleString() : "Not updated yet"}
                          </p>
                        )}
                        {trip.distanceTraveled && trip.distanceTraveled > 0 && (
                          <p className="flex items-center mt-2">
                            <span className="font-medium mr-2">Distance:</span>
                            {trip.distanceTraveled.toFixed(1)} km
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <div className="w-full">
                        <p className="text-xs text-primary-700 mb-2 flex items-center justify-center">
                          <InfoIcon className="h-3 w-3 mr-1" />
                          <span>Click to see active itinerary details ("kumon")</span>
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => handleViewTripTracking(trip.id)}
                          className="w-full inline-flex items-center justify-center"
                        >
                          <NavigationIcon className="h-4 w-4 mr-2" />
                          View &amp; Track Trip
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              // No active trips
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <NavigationIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-neutral-900 mb-1">No active trips</h3>
                <p className="text-neutral-500 mb-6">
                  You don't have any in-progress trips at the moment.
                </p>
                <Button 
                  onClick={() => navigate("/trips")}
                  className="inline-flex items-center"
                >
                  View All Trips
                </Button>
              </div>
            )}
          </>
        )}
        
        {/* Itinerary selection dialog */}
        <Dialog open={showItinerarySelector} onOpenChange={setShowItinerarySelector}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Plan Your Trip Route</DialogTitle>
              <DialogDescription>
                Select routes and itinerary items to track during your journey.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              {isLoadingItinerary ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : itineraryItems && itineraryItems.length > 0 ? (
                <div className="space-y-6">
                  {/* Route Options Selection */}
                  {routeOptionGroups.length > 1 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium mb-2">Select Travel Route</h3>
                      <Tabs defaultValue="all" className="w-full">
                        <TabsList className="mb-2 w-full">
                          <TabsTrigger value="all" className="flex-1">All Stops</TabsTrigger>
                          {routeOptionGroups.map((route: RouteGroup, index: number) => (
                            <TabsTrigger 
                              key={route.destination} 
                              value={route.destination}
                              className="flex-1"
                            >
                              Route {index + 1} ({route.count})
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        
                        <TabsContent value="all">
                          <div className="rounded-md border p-4 bg-background/50">
                            <h4 className="font-medium">All Stops ({itineraryItems.length})</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              Track all stops in your itinerary
                            </p>
                            
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => {
                                // Select all itinerary items
                                setSelectedItineraryIds(itineraryItems.map((item: ItineraryItem) => item.id));
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Select All Items
                            </Button>
                          </div>
                        </TabsContent>
                        
                        {routeOptionGroups.map((route: RouteGroup) => (
                          <TabsContent key={route.destination} value={route.destination}>
                            <div className="rounded-md border p-4 bg-background/50">
                              <h4 className="font-medium">
                                {route.destination === 'unknown' 
                                  ? 'Unnamed Route' 
                                  : `Route to ${route.destination}`}
                              </h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {route.count} stops along this route
                              </p>
                              
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="mt-2"
                                onClick={() => {
                                  // Select only items from this route
                                  setSelectedItineraryIds(route.items.map((item: ItineraryItem) => item.id));
                                }}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Select This Route
                              </Button>
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  )}
                  
                  {/* Itinerary Items Selection */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Itinerary Items
                      {selectedItineraryIds.length > 0 && 
                        ` (${selectedItineraryIds.length} selected)`}
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto p-1">
                      {itineraryItems
                        .sort((a, b) => a.day - b.day)
                        .map((item: ItineraryItem) => (
                          <div 
                            key={item.id} 
                            className={cn(
                              "flex items-start space-x-3 py-2 px-3 rounded-md",
                              selectedItineraryIds.includes(item.id) && "bg-muted/50"
                            )}
                          >
                            <Checkbox
                              id={`itinerary-${item.id}`}
                              checked={selectedItineraryIds.includes(item.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedItineraryIds(prev => [...prev, item.id]);
                                } else {
                                  setSelectedItineraryIds(prev => prev.filter(id => id !== item.id));
                                }
                              }}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor={`itinerary-${item.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {item.title}
                              </label>
                              <p className="text-sm text-muted-foreground">
                                Day {item.day} - {item.location ? 
                                  (item.locationDisplay || cleanLocationString(item.location)) : 
                                  (item.fromLocation && item.toLocation ? 
                                    `${item.fromLocationDisplay || cleanLocationString(item.fromLocation)} to ${item.toLocationDisplay || cleanLocationString(item.toLocation)}` : 
                                    'No location specified')}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-2">
                    No itinerary items found for this trip.
                  </p>
                  <p className="text-sm">You can still start the trip without selecting any items.</p>
                </div>
              )}
            </div>
            
            <DialogFooter className="flex flex-row justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowItinerarySelector(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => startTripMutation.mutate()}
                disabled={startTripMutation.isPending}
              >
                {startTripMutation.isPending ? 'Starting Trip...' : 'Start Trip'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Trip completion confirmation dialog */}
        <Dialog open={showCompletionConfirmDialog} onOpenChange={setShowCompletionConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Trip Completion</DialogTitle>
              <DialogDescription>
                {completionError || "Are you sure you want to complete this trip?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCompletionConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => completeTripMutation.mutate({ confirmComplete: true })}
                disabled={completeTripMutation.isPending}
              >
                {completeTripMutation.isPending ? 'Completing...' : 'Complete Trip'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}