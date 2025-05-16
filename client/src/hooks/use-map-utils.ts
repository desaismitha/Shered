import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

type Coordinates = {
  lat: number;
  lng: number;
};

export function useMapUtils() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Format an address string with coordinates appended in the format: "Address [lat, lng]"
   * If the address already has coordinates, it will return it unchanged
   */
  const formatAddressWithCoordinates = useCallback((address: string, coordinates: Coordinates): string => {
    // Check if the address already has coordinates
    if (address.includes('[') && address.includes(']')) {
      return address;
    }
    return `${address} [${coordinates.lat}, ${coordinates.lng}]`;
  }, []);

  /**
   * Extract coordinates from an address string in the format: "Address [lat, lng]"
   * Returns null if no coordinates are found
   */
  const extractCoordinatesFromAddress = useCallback((address: string): Coordinates | null => {
    const coordRegex = /\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/;
    const match = address.match(coordRegex);
    
    if (match && match.length === 3) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  }, []);

  /**
   * Clean an address by removing coordinates in brackets
   */
  const cleanAddress = useCallback((address: string): string => {
    return address.replace(/\s*\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]\s*$/, '').trim();
  }, []);

  /**
   * Get a formatted address with coordinates based on user's current location
   */
  const getCurrentLocationAddress = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          setError('Geolocation is not supported by your browser');
          setIsLoading(false);
          reject('Geolocation is not supported by your browser');
          return;
        }
        
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              
              // Call our reverse geocoding API endpoint
              const response = await apiRequest(
                'GET', 
                `/api/geocode/reverse?lat=${latitude}&lng=${longitude}`
              );
              
              const data = await response.json();
              setIsLoading(false);
              
              // Return formatted address with coordinates
              resolve(data.address);
            } catch (err) {
              setError('Failed to get address from coordinates');
              setIsLoading(false);
              reject('Failed to get address from coordinates');
            }
          },
          (err) => {
            setError(`Error getting location: ${err.message}`);
            setIsLoading(false);
            reject(`Error getting location: ${err.message}`);
          }
        );
      });
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
      throw err;
    }
  }, []);
  
  /**
   * Try to reverse-geocode coordinates to get a readable address
   */
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('GET', `/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      setIsLoading(false);
      return data.address;
    } catch (err) {
      setError('Failed to reverse geocode coordinates');
      setIsLoading(false);
      return `Location at [${lat}, ${lng}]`;
    }
  }, []);

  /**
   * Get address suggestions based on a search query (forward geocoding)
   */
  const getAddressSuggestions = useCallback(async (query: string): Promise<string[]> => {
    if (!query || query.length < 3) {
      return [];
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('GET', `/api/geocode/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setIsLoading(false);
      return data.results || [];
    } catch (err) {
      setError('Failed to get address suggestions');
      setIsLoading(false);
      return [];
    }
  }, []);

  return {
    formatAddressWithCoordinates,
    extractCoordinatesFromAddress,
    cleanAddress,
    getCurrentLocationAddress,
    reverseGeocode,
    getAddressSuggestions,
    isLoading,
    error
  };
}