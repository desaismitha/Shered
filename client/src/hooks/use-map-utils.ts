import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useMapUtils() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Format an address string with coordinates appended in the format: "Address [lat, lng]"
   * If the address already has coordinates, it will return it unchanged
   */
  const formatAddressWithCoordinates = (address: string, lat: number, lng: number): string => {
    // Check if the address already has coordinates
    if (address.includes('[') && address.includes(']')) {
      return address;
    }
    return `${address} [${lat.toFixed(6)}, ${lng.toFixed(6)}]`;
  };

  /**
   * Extract coordinates from an address string in the format: "Address [lat, lng]"
   * Returns null if no coordinates are found
   */
  const extractCoordinatesFromAddress = (address: string): { lat: number, lng: number } | null => {
    const regex = /\[([-+]?\d+\.\d+),\s*([-+]?\d+\.\d+)\]/;
    const match = address.match(regex);
    
    if (match && match.length >= 3) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  };

  /**
   * Clean an address by removing coordinates in brackets
   */
  const cleanAddressString = (address: string): string => {
    return address.replace(/\s*\[[-+]?\d+\.\d+,\s*[-+]?\d+\.\d+\]\s*$/, '').trim();
  };

  /**
   * Get a formatted address with coordinates based on user's current location
   */
  const getAddressWithCoordinates = async (latitude: number, longitude: number): Promise<string> => {
    setIsProcessing(true);
    try {
      // Try to get the address from the coordinates using reverse geocoding
      const response = await fetch(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`);
      
      if (response.ok) {
        const data = await response.json();
        const address = data.address || 'Unknown location';
        return formatAddressWithCoordinates(address, latitude, longitude);
      } else {
        // If we can't get an address, just return the coordinates
        return `Location at [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`;
      }
    } catch (error) {
      console.error('Error getting address:', error);
      return `Location at [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    formatAddressWithCoordinates,
    extractCoordinatesFromAddress,
    cleanAddressString,
    getAddressWithCoordinates
  };
}