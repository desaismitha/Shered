import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Global variable to track if map is already created
// This is outside React state to persist across renders
let mapInstanceIds: string[] = [];

interface Coordinate {
  lat: number;
  lng: number;
}

interface TripMapContainerProps {
  id: string;
  center: Coordinate;
  bounds?: L.LatLngBoundsExpression;
  zoom?: number;
  children: React.ReactNode;
  height?: string;
  width?: string;
  className?: string;
}

/**
 * A specialized map container component that ensures only one instance
 * of a map with the same ID exists at a time.
 */
const TripMapContainer: React.FC<TripMapContainerProps> = ({
  id,
  center,
  bounds,
  zoom = 12,
  children,
  height = '300px',
  width = '100%',
  className = '',
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // On mount, check if this map ID already exists
  useEffect(() => {
    if (mapInstanceIds.includes(id)) {
      console.warn(`Map with ID ${id} already exists, not rendering duplicate`);
      setShouldRender(false);
    } else {
      console.log(`Creating new map with ID ${id}`);
      mapInstanceIds.push(id);
      setShouldRender(true);
    }
    
    // Cleanup on unmount
    return () => {
      mapInstanceIds = mapInstanceIds.filter(mapId => mapId !== id);
      console.log(`Removed map with ID ${id}`);
    };
  }, [id]);
  
  if (!shouldRender) {
    return (
      <div 
        ref={containerRef}
        className={`trip-map-placeholder ${className}`}
        style={{ height, width, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', border: '1px dashed #d1d5db' }}
      >
        <div className="text-neutral-400">Map already visible in another tab</div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className={`trip-map-container ${className}`}
      style={{ height, width }}
    >
      <MapContainer
        key={id}
        center={[center.lat, center.lng]}
        bounds={bounds}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>
    </div>
  );
};

export default TripMapContainer;