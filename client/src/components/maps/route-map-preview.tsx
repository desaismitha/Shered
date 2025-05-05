import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

// This component updates the map view when props change
interface MapUpdaterProps {
  center: Coordinate;
  bounds: L.LatLngBounds;
  startCoords: Coordinate | null;
  endCoords: Coordinate | null;
  currentPosition: Coordinate | null;
}

function MapUpdater({ center, bounds, startCoords, endCoords, currentPosition }: MapUpdaterProps) {
  const map = useMap();
  
  // Update the map view when coordinates change
  useEffect(() => {
    if ((startCoords && endCoords) || currentPosition) {
      console.log('[MAP DEBUG] Updating map view to fit bounds');
      map.fitBounds(bounds);
    } else if (startCoords || endCoords) {
      console.log('[MAP DEBUG] Updating map center to', center);
      map.setView([center.lat, center.lng], 13);
    }
  }, [map, center, bounds, startCoords, endCoords, currentPosition]);
  
  return null;
}

interface Coordinate {
  lat: number;
  lng: number;
}

interface RouteMapPreviewProps {
  startLocation: string | null;
  endLocation: string | null;
  showMap: boolean;
  onToggleMap?: () => void;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
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
  
  console.log("[MAP DEBUG] Parsing coordinates for:", locationStr);
  
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
      console.log("[MAP DEBUG] Found explicit coordinates:", { lat, lng });
      return { lat, lng };
    }
  }
  
  // Check for city names
  const normalizedName = locationStr.toLowerCase().trim();
  console.log("[MAP DEBUG] Checking city name:", normalizedName);
  
  for (const [cityName, coordinates] of Object.entries(CITY_COORDINATES)) {
    if (normalizedName === cityName || 
        normalizedName.startsWith(cityName + " ") || 
        normalizedName.endsWith(" " + cityName) ||
        normalizedName.includes(" " + cityName + " ")) {
      console.log("[MAP DEBUG] Found city coordinates for", cityName, ":", coordinates);
      return coordinates;
    }
  }
  
  console.log("[MAP DEBUG] No coordinates found for:", locationStr);
  return null;
}

const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  startLocation,
  endLocation,
  showMap,
  onToggleMap,
  currentLatitude,
  currentLongitude
}) => {
  const [startCoords, setStartCoords] = useState<Coordinate | null>(null);
  const [endCoords, setEndCoords] = useState<Coordinate | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Coordinate | null>(null);
  const [routePath, setRoutePath] = useState<Coordinate[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  
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
  
  const currentPositionIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  // Fetch Mapbox token from config API
  useEffect(() => {
    async function fetchMapboxToken() {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        console.log("[MAP DEBUG] Config API response:", data);
        if (data.mapboxToken) {
          console.log("[MAP DEBUG] Successfully fetched Mapbox token from API");
          setMapboxToken(data.mapboxToken);
        }
      } catch (error) {
        console.error("[MAP DEBUG] Failed to fetch Mapbox token:", error);
      }
    }
    
    fetchMapboxToken();
  }, []);

  // Parse coordinates from location strings
  useEffect(() => {
    setStartCoords(parseCoordinates(startLocation));
    setEndCoords(parseCoordinates(endLocation));
  }, [startLocation, endLocation]);
  
  // Update current position when lat/long changes
  useEffect(() => {
    if (currentLatitude !== undefined && currentLatitude !== null && 
        currentLongitude !== undefined && currentLongitude !== null) {
      console.log('[MAP DEBUG] Setting current position:', currentLatitude, currentLongitude);
      setCurrentPosition({
        lat: currentLatitude,
        lng: currentLongitude
      });
    } else {
      setCurrentPosition(null);
    }
  }, [currentLatitude, currentLongitude]);
  
  // Generate an interpolated route with fewer points
  const generateInterpolatedRoute = useCallback((start: Coordinate, end: Coordinate) => {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log("[MAP] Generating interpolated route");
    }
    
    const numPoints = 8; // Reduced for better performance
    const coordinates: Coordinate[] = [];
    
    // Add start point
    coordinates.push(start);
    
    // Add intermediate points with slight variation to make it look more like a road
    for (let i = 1; i < numPoints; i++) {
      const fraction = i / numPoints;
      const lat = start.lat + fraction * (end.lat - start.lat);
      const lng = start.lng + fraction * (end.lng - start.lng);
      
      // Add a slight curve to the straight line
      const perpFactor = Math.sin(fraction * Math.PI) * 0.005; // controls the amount of curve
      const dx = end.lat - start.lat;
      const dy = end.lng - start.lng;
      // Perpendicular offset
      const offsetLat = -dy * perpFactor;
      const offsetLng = dx * perpFactor;
      
      coordinates.push({ 
        lat: lat + offsetLat, 
        lng: lng + offsetLng 
      });
    }
    
    // Add end point
    coordinates.push(end);
    
    return coordinates;
  }, []);

  // Enhanced route cache with both memory and sessionStorage
  const routeCache = useRef<Record<string, Coordinate[]>>({});
  
  // Pre-load route cache from sessionStorage on component mount
  useEffect(() => {
    // Load all route-related keys from sessionStorage into memory cache
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('route-')) {
          const cachedData = sessionStorage.getItem(key);
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                routeCache.current[key] = parsed.map(point => ({ lat: point[0], lng: point[1] }));
              }
            } catch (e) {
              // Ignore invalid JSON
            }
          }
        }
      }
    } catch (e) {
      // Silently fail if sessionStorage is not available
    }
  }, []);
  
  // Fetch route when both coordinates are available - optimized for speed
  useEffect(() => {
    let isMounted = true;
    
    async function fetchRoute() {
      if (!startCoords || !endCoords) {
        setRoutePath([]);
        return;
      }
      
      try {
        setIsLoadingRoute(true);
        setError(null);
        
        // Generate interpolated route IMMEDIATELY for instant feedback
        const interpolatedRoute = generateInterpolatedRoute(startCoords, endCoords);
        if (isMounted) {
          setRoutePath(interpolatedRoute);
        }
        
        // Round coordinates to 4 decimals to improve cache hit rate
        // This is about 11 meters of precision, good enough for most routes
        const cacheKey = `route-${startCoords.lat.toFixed(4)},${startCoords.lng.toFixed(4)}-${endCoords.lat.toFixed(4)},${endCoords.lng.toFixed(4)}`;
        
        // Check memory cache (fastest)
        if (routeCache.current[cacheKey]) {
          if (isMounted) {
            setRoutePath(routeCache.current[cacheKey]);
            setIsLoadingRoute(false);
          }
          return;
        }
        
        // Check for alternate routes (approximate matches) in the cache
        const similarRoutes = Object.keys(routeCache.current).filter(key => {
          // Extract coordinates from the cache key
          const matches = key.match(/route-(-?\d+\.\d+),(-?\d+\.\d+)-(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (matches && matches.length === 5) {
            const [, cachedStartLat, cachedStartLng, cachedEndLat, cachedEndLng] = matches;
            
            // Check if the coordinates are close (within ~500 meters)
            const startLatDiff = Math.abs(parseFloat(cachedStartLat) - startCoords.lat);
            const startLngDiff = Math.abs(parseFloat(cachedStartLng) - startCoords.lng);
            const endLatDiff = Math.abs(parseFloat(cachedEndLat) - endCoords.lat);
            const endLngDiff = Math.abs(parseFloat(cachedEndLng) - endCoords.lng);
            
            // If coordinates are very close, reuse the route
            return (startLatDiff < 0.005 && startLngDiff < 0.005 && 
                   endLatDiff < 0.005 && endLngDiff < 0.005);
          }
          return false;
        });
        
        if (similarRoutes.length > 0) {
          // Use the first similar route
          const similarRoute = routeCache.current[similarRoutes[0]];
          if (isMounted) {
            setRoutePath(similarRoute);
            // Still continue to fetch the exact route in background
          }
        }
        
        // Check sessionStorage (slightly slower than memory)
        try {
          const cachedData = sessionStorage.getItem(cacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const cachedRoute = parsed.map(point => ({ lat: point[0], lng: point[1] }));
              
              // Save to memory cache
              routeCache.current[cacheKey] = cachedRoute;
              
              if (isMounted) {
                setRoutePath(cachedRoute);
                setIsLoadingRoute(false);
              }
              return;
            }
          }
        } catch (cacheErr) {
          // Already using interpolated route, continue
        }
        
        // Only proceed with Mapbox API if token is available
        if (!mapboxToken) {
          if (isMounted) {
            setIsLoadingRoute(false);
          }
          return;
        }
        
        try {
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/` +
            `${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}` +
            `?steps=true&geometries=geojson&access_token=${mapboxToken}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced timeout to 3 seconds
          
          const response = await fetch(url, { 
            signal: controller.signal,
            // Add cache headers to improve browser caching
            headers: {
              'Cache-Control': 'max-age=86400' // Cache for 24 hours
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch route: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates?.length > 0) {
            // Extract the coordinates from the route (MapBox returns [lng, lat])
            const allCoordinates = data.routes[0].geometry.coordinates;
            
            // Reduce the number of points for better performance
            // Take approximately 1 point every 100 meters for a smoother look
            // but fewer total points to render
            const routeCoordinates: Coordinate[] = [];
            const stride = Math.max(1, Math.floor(allCoordinates.length / 40)); // No more than 40 points
            
            for (let i = 0; i < allCoordinates.length; i += stride) {
              const coord = allCoordinates[i];
              routeCoordinates.push({ lng: coord[0], lat: coord[1] });
            }
            
            // Ensure the last point is included
            if (allCoordinates.length > 0 && (allCoordinates.length - 1) % stride !== 0) {
              const lastCoord = allCoordinates[allCoordinates.length - 1];
              routeCoordinates.push({ lng: lastCoord[0], lat: lastCoord[1] });
            }
            
            // Save to memory cache - use a more efficient data structure
            routeCache.current[cacheKey] = routeCoordinates;
            
            // Cache the result in sessionStorage
            try {
              const cacheData = routeCoordinates.map((p: Coordinate) => [p.lat, p.lng]);
              sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (storageErr) {
              // Silent fail, we can still use the route in memory
            }
            
            if (isMounted) {
              setRoutePath(routeCoordinates);
            }
          }
        } catch (error) {
          // We're already showing the interpolated route, so no need to show an error
          if (error instanceof Error && error.name === 'AbortError') {
            console.warn('Route request timed out, using interpolated route');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Could not calculate route');
        }
      } finally {
        if (isMounted) {
          setIsLoadingRoute(false);
        }
      }
    }
    
    // Start fetching immediately without any debounce
    fetchRoute();
    
    return () => {
      isMounted = false;
    };
  }, [startCoords, endCoords, mapboxToken, generateInterpolatedRoute]);
  
  // Calculate map bounds to fit all markers (including current position if available)
  const getBounds = () => {
    const points: Coordinate[] = [];
    if (startCoords) points.push(startCoords);
    if (endCoords) points.push(endCoords);
    if (currentPosition) points.push(currentPosition);
    
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
              zoomControl={false} // Move zoom control to right side
            >
              {/* This custom component updates the map view when coordinates change */}
              <MapUpdater 
                center={getCenter()} 
                bounds={getBounds()} 
                startCoords={startCoords}
                endCoords={endCoords}
                currentPosition={currentPosition}
              />
              
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Add zoom control in a better position */}
              <div className="leaflet-top leaflet-right">
                <div className="leaflet-control-zoom leaflet-bar leaflet-control">
                  <button title="Zoom in" className="leaflet-control-zoom-in">+</button>
                  <button title="Zoom out" className="leaflet-control-zoom-out">-</button>
                </div>
              </div>
              
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
              
              {/* Show current position if available */}
              {currentPosition && (
                <Marker position={currentPosition} icon={currentPositionIcon}>
                  <Popup>
                    Current Position: {currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}
                    <div className="text-xs text-muted-foreground mt-1">
                      Updated: {new Date().toLocaleTimeString()}
                    </div>
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