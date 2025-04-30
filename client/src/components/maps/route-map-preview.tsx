import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Coordinate {
  lat: number;
  lng: number;
}

interface RouteMapPreviewProps {
  startLocation: string | null;
  endLocation: string | null;
  showMap: boolean;
  onToggleMap?: () => void;
}

// City coordinates lookup table
const CITY_COORDINATES: Record<string, Coordinate> = {
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'bellevue': { lat: 47.6101, lng: -122.2015 },
  'redmond': { lat: 47.6740, lng: -122.1215 },
  'kirkland': { lat: 47.6769, lng: -122.2060 },
  'sammamish': { lat: 47.6163, lng: -122.0356 },
  'issaquah': { lat: 47.5301, lng: -122.0326 },
  'tacoma': { lat: 47.2529, lng: -122.4443 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'portland': { lat: 45.5152, lng: -122.6784 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'california': { lat: 36.7783, lng: -119.4179 },
  'washington': { lat: 47.7511, lng: -120.7401 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 },
  'tirupati': { lat: 13.6288, lng: 79.4192 }
};

function parseCoordinates(locationStr: string | null): Coordinate | null {
  if (!locationStr) return null;
  
  // Try to extract coordinates in format [lat, lng]
  let match = locationStr.match(/\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/);
  
  // If not found, try format (lat, lng)
  if (!match) {
    match = locationStr.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  }
  
  if (match && match.length === 3) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    if (!isNaN(lat) && !isNaN(lng) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  
  // Check for city names
  const normalizedName = locationStr.toLowerCase().trim();
  for (const [cityName, coordinates] of Object.entries(CITY_COORDINATES)) {
    if (normalizedName === cityName || 
        normalizedName.startsWith(cityName + " ") || 
        normalizedName.endsWith(" " + cityName) ||
        normalizedName.includes(" " + cityName + " ")) {
      return coordinates;
    }
  }
  
  return null;
}

const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  startLocation,
  endLocation,
  showMap,
  onToggleMap
}) => {
  const [startCoords, setStartCoords] = useState<Coordinate | null>(null);
  const [endCoords, setEndCoords] = useState<Coordinate | null>(null);
  const [routePath, setRoutePath] = useState<Coordinate[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Define custom marker icons
  const startIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  const endIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  // Parse coordinates from location strings
  useEffect(() => {
    setStartCoords(parseCoordinates(startLocation));
    setEndCoords(parseCoordinates(endLocation));
  }, [startLocation, endLocation]);
  
  // Fetch route when both coordinates are available
  useEffect(() => {
    async function fetchRoute() {
      if (!startCoords || !endCoords) {
        setRoutePath([]);
        return;
      }
      
      try {
        setIsLoadingRoute(true);
        setError(null);
        
        // Try to use cache first - create cache key from coordinates
        const cacheKey = `route-${startCoords.lat},${startCoords.lng}-${endCoords.lat},${endCoords.lng}`;
        let cachedRoute = null;
        
        try {
          const cachedData = sessionStorage.getItem(cacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              cachedRoute = parsed.map(point => ({ lat: point[0], lng: point[1] }));
              console.log('Using cached route with', cachedRoute.length, 'points');
            }
          }
        } catch (cacheErr) {
          console.warn('Could not retrieve cached route:', cacheErr);
        }
        
        if (cachedRoute && cachedRoute.length > 0) {
          setRoutePath(cachedRoute);
          setIsLoadingRoute(false);
          return;
        }
        
        // Get route from Mapbox Directions API if we have a token
        if (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN) {
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/` +
            `${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}` +
            `?steps=true&geometries=geojson&access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}`
          );
          
          if (!response.ok) {
            throw new Error('Failed to fetch route from Mapbox');
          }
          
          const data = await response.json();
          
          if (data.routes && data.routes.length > 0) {
            // Extract the coordinates from the route
            const routeCoordinates = data.routes[0].geometry.coordinates.map(
              (coord: [number, number]) => ({ lng: coord[0], lat: coord[1] })
            );
            
            // Cache the result for future use
            try {
              const cacheData = routeCoordinates.map((p: Coordinate) => [p.lat, p.lng]);
              sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (cacheErr) {
              console.warn('Could not cache route data:', cacheErr);
            }
            
            setRoutePath(routeCoordinates);
          } else {
            // Create interpolated route with multiple points
            generateInterpolatedRoute(startCoords, endCoords);
          }
        } else {
          // If no Mapbox token, create interpolated route with multiple points
          generateInterpolatedRoute(startCoords, endCoords);
        }
      } catch (err) {
        console.error('Failed to fetch route:', err);
        setError(err instanceof Error ? err.message : 'Unknown error fetching route');
        // Create fallback interpolated route
        generateInterpolatedRoute(startCoords, endCoords);
      } finally {
        setIsLoadingRoute(false);
      }
    }
    
    // Create a route with intermediate points to make it look more natural
    function generateInterpolatedRoute(start: Coordinate, end: Coordinate) {
      const numPoints = 10; // Number of intermediate points
      const coordinates: Coordinate[] = [];
      
      // Add start point
      coordinates.push(start);
      
      // Add intermediate points
      for (let i = 1; i < numPoints; i++) {
        const fraction = i / numPoints;
        const lat = start.lat + fraction * (end.lat - start.lat);
        const lng = start.lng + fraction * (end.lng - start.lng);
        coordinates.push({ lat, lng });
      }
      
      // Add end point
      coordinates.push(end);
      
      // Set the route
      setRoutePath(coordinates);
    }
    
    fetchRoute();
  }, [startCoords, endCoords]);
  
  // Calculate map bounds to fit all markers
  const getBounds = () => {
    const points: Coordinate[] = [];
    if (startCoords) points.push(startCoords);
    if (endCoords) points.push(endCoords);
    
    if (points.length === 0) {
      // Default to Seattle area if no points
      return L.latLngBounds(
        [47.5, -122.4],
        [47.7, -122.2]
      );
    } else if (points.length === 1) {
      // Single point - create a small bounding box around it
      const p = points[0];
      return L.latLngBounds(
        [p.lat - 0.01, p.lng - 0.01],
        [p.lat + 0.01, p.lng + 0.01]
      );
    } else {
      // Multiple points - create bounds that contain all points
      return L.latLngBounds(points);
    }
  };
  
  // Returns the center point for the map
  const getCenter = (): Coordinate => {
    if (startCoords && endCoords) {
      // Center between both points
      return {
        lat: (startCoords.lat + endCoords.lat) / 2,
        lng: (startCoords.lng + endCoords.lng) / 2
      };
    } else if (startCoords) {
      return startCoords;
    } else if (endCoords) {
      return endCoords;
    } else {
      // Default to Seattle
      return { lat: 47.6062, lng: -122.3321 };
    }
  };
  
  // For displaying clean location names without coordinates
  const getDisplayName = (location: string | null): string => {
    if (!location) return 'Not specified';
    return location.replace(/\[.*?\]/, '').trim();
  };
  
  return (
    <div className="space-y-2">
      {showMap && (
        <>
          <div className="rounded-md overflow-hidden border border-border" style={{ height: '300px' }}>
            <MapContainer
              center={getCenter()}
              bounds={getBounds()}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {startCoords && (
                <Marker position={startCoords} icon={startIcon}>
                  <Popup>
                    Start: {getDisplayName(startLocation)}
                  </Popup>
                </Marker>
              )}
              
              {endCoords && (
                <Marker position={endCoords} icon={endIcon}>
                  <Popup>
                    End: {getDisplayName(endLocation)}
                  </Popup>
                </Marker>
              )}
              
              {/* Render the route path */}
              {routePath.length > 0 && (
                <Polyline 
                  positions={routePath.map(coord => [coord.lat, coord.lng] as [number, number])} 
                  color="#3b82f6" 
                  weight={4} 
                  opacity={0.7} 
                  smoothFactor={1}
                />
              )}
            </MapContainer>
          </div>
          
          {error && (
            <div className="text-sm text-red-500">
              {error}
            </div>
          )}
          
          <div className="flex text-xs text-muted-foreground gap-4">
            <div>
              <span className="font-medium">Start:</span> {getDisplayName(startLocation)}
            </div>
            <div>
              <span className="font-medium">End:</span> {getDisplayName(endLocation)}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RouteMapPreview;