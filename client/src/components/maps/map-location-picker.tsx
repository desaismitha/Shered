import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface MapLocationPickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  defaultLocation?: [number, number]; // Default center coordinates [lat, lng]
  required?: boolean;
}

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Enter location',
  defaultLocation = [47.6062, -122.3321], // Default to Seattle (used for coordinates if needed)
  required = false
}) => {
  const { toast } = useToast();
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Array<{place_name: string, lat: number, lon: number}>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [originalValue, setOriginalValue] = useState<string>(value);
  
  // Create caches for search results and suggestions
  const suggestionCache = useRef<Record<string, Array<{place_name: string, lat: number, lon: number}>>>({});
  const searchCache = useRef<Record<string, { lat: number, lon: number }>>({});
  
  // Parse coordinates from the value if they exist
  useEffect(() => {
    if (value) {
      // Update the stored original value whenever the value prop changes
      setOriginalValue(value);
      
      const match = value.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        setMarkerPosition([lat, lng]);
      }
      
      // Update search input with the readable part of the value - clean any coordinates
      let displayValue = value;
      if (displayValue.includes('[')) {
        displayValue = displayValue.substring(0, displayValue.indexOf('[')).trim();
      }
      // Also remove any coordinates in parentheses if present
      if (displayValue.includes('(')) {
        displayValue = displayValue.substring(0, displayValue.indexOf('(')).trim();
      }
      setSearchInput(displayValue);
    } else {
      setOriginalValue('');
      setSearchInput('');
      setMarkerPosition(null);
    }
  }, [value]);
  
  // Handle search for locations with caching
  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    
    const normalizedInput = searchInput.trim().toLowerCase();
    
    // Check cache first to avoid unnecessary API calls
    if (searchCache.current[normalizedInput]) {
      const { lat, lon } = searchCache.current[normalizedInput];
      setMarkerPosition([lat, lon]);
      
      // Format with coordinates
      const displayName = searchInput.split(',').slice(0, 3).join(',');
      const locationString = `${displayName} [${lat.toFixed(6)}, ${lon.toFixed(6)}]`;
      onChange(locationString);
      return;
    }
    
    setIsSearching(true);
    try {
      // First check if there's an exact match in the suggestions cache
      for (const key in suggestionCache.current) {
        const suggestions = suggestionCache.current[key];
        for (const suggestion of suggestions) {
          if (suggestion.place_name.toLowerCase().includes(normalizedInput)) {
            setMarkerPosition([suggestion.lat, suggestion.lon]);
            const displayName = suggestion.place_name.split(',').slice(0, 3).join(',');
            const locationString = `${displayName} [${suggestion.lat.toFixed(6)}, ${suggestion.lon.toFixed(6)}]`;
            onChange(locationString);
            searchCache.current[normalizedInput] = { lat: suggestion.lat, lon: suggestion.lon };
            setIsSearching(false);
            return;
          }
        }
      }
      
      // If not in cache, make API request
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=1`, {
        headers: {
          'User-Agent': 'TravelGroupr App'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to search location');
      }
      
      const results = await response.json();
      if (results && results.length > 0) {
        const { lat, lon } = results[0];
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lon);
        
        // Add to cache
        searchCache.current[normalizedInput] = { lat: latNum, lon: lngNum };
        
        setMarkerPosition([latNum, lngNum]);
        // Just use the display name from the search result instead of making another geocode request
        const displayName = results[0].display_name.split(',').slice(0, 3).join(',');
        const locationString = `${displayName} [${latNum.toFixed(6)}, ${lngNum.toFixed(6)}]`;
        onChange(locationString);
      } else {
        // No results, but still update the input
        onChange(searchInput);
      }
    } catch (error) {
      console.error('Error searching for location:', error);
      onChange(searchInput);
    } finally {
      setIsSearching(false);
    }
  }, [searchInput, onChange]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchInput(newValue);
    
    // If the input is cleared, also clear the marker
    if (!newValue.trim()) {
      setMarkerPosition(null);
      onChange('');
    }
  };
  
  // Add effect to fetch location suggestions as user types with improved caching
  useEffect(() => {
    // Only show suggestions when there are at least 3 characters
    if (!searchInput || searchInput.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    const normalizedInput = searchInput.trim().toLowerCase();
    
    // Check cache first for immediate response
    if (suggestionCache.current[normalizedInput]) {
      setSuggestions(suggestionCache.current[normalizedInput]);
      setShowSuggestions(true);
      return;
    }
    
    // Check partial matches in cache to provide instant feedback
    const partialMatches: Array<{place_name: string, lat: number, lon: number}> = [];
    for (const key in suggestionCache.current) {
      if (key.includes(normalizedInput) || normalizedInput.includes(key)) {
        // Add cached results that partially match
        partialMatches.push(...suggestionCache.current[key]);
      }
    }
    
    if (partialMatches.length > 0) {
      // Show partial matches immediately while fetching new results
      setSuggestions(partialMatches.slice(0, 5)); // Limit to 5 suggestions
      setShowSuggestions(true);
    }
    
    const fetchSuggestions = async () => {
      try {
        setIsSearching(true);
        
        // Reduced delay to make it more responsive (150-200ms)
        await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 50));
        
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=5`, {
          headers: {
            'User-Agent': 'TravelGroupr App'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }
        
        const results = await response.json();
        if (results && results.length > 0) {
          const formattedResults = results.map((item: any) => ({
            place_name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
          }));
          
          // Update cache
          suggestionCache.current[normalizedInput] = formattedResults;
          
          setSuggestions(formattedResults);
          setShowSuggestions(true);
        } else if (partialMatches.length === 0) {
          // Only clear suggestions if we don't have partial matches
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        // Only clear suggestions if we don't have partial matches
        if (partialMatches.length === 0) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        setIsSearching(false);
      }
    };
    
    // Reduced debounce time for better responsiveness
    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 300); // Reduced from 800ms to 300ms
    
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Handle Enter key in search
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Handle selection from suggestions dropdown
  const handleSelectSuggestion = async (suggestion: {place_name: string, lat: number, lon: number}) => {
    // First hide suggestions to prevent UI conflicts
    setShowSuggestions(false);
    
    // Use a short timeout to ensure UI state is updated before continuing
    setTimeout(() => {
      // Update the input field with a shortened display name
      const displayName = suggestion.place_name.split(',').slice(0, 3).join(',');
      setSearchInput(displayName);
      
      // Update marker position
      setMarkerPosition([suggestion.lat, suggestion.lon]);
      
      // Format location with coordinates for storage
      const locationString = `${displayName} [${suggestion.lat.toFixed(6)}, ${suggestion.lon.toFixed(6)}]`;
      
      // Update parent component with the new value
      onChange(locationString);
    }, 10);
  };
  
  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    console.log('Getting current location...');
    
    // Check if geolocation is supported by the browser
    if (!navigator.geolocation) {
      console.error('Geolocation API not supported in this browser');
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation services.",
        variant: "destructive"
      });
      return;
    }
    
    // Show loading state
    setIsGettingLocation(true);
    setShowSuggestions(false); // Hide any open suggestions
    
    // Create a timeout to handle cases where the browser might hang
    const locationTimeout = setTimeout(() => {
      console.warn('Geolocation request taking too long, may have stalled');
      setIsGettingLocation(false);
      toast({
        title: "Location request timeout",
        description: "The location request is taking longer than expected. Please try again or enter location manually.",
        variant: "destructive"
      });
    }, 15000); // 15 seconds timeout as a safety measure
    
    try {
      // Get current position
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Clear the safety timeout
          clearTimeout(locationTimeout);
          
          try {
            console.log('Got position:', position.coords.latitude, position.coords.longitude);
            const { latitude, longitude, accuracy } = position.coords;
            
            // Log accuracy for debugging
            console.log(`Location accuracy: ${accuracy} meters`);
            
            // Update the marker position immediately
            setMarkerPosition([latitude, longitude]);
            
            try {
              // Reverse geocode to get address from coordinates
              console.log('Attempting reverse geocoding...');
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18`,
                {
                  headers: {
                    'User-Agent': 'TravelGroupr App'
                  }
                }
              );
              
              if (!response.ok) {
                throw new Error(`Failed to reverse geocode location: ${response.status} ${response.statusText}`);
              }
              
              const data = await response.json();
              console.log('Reverse geocode result:', data);
              
              if (data && data.display_name) {
                // Format the display name to be more concise
                const displayName = data.display_name.split(',').slice(0, 3).join(',');
                setSearchInput(displayName);
                
                // Update with the location string including coordinates
                const locationString = `${displayName} [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`;
                onChange(locationString);
                
                toast({
                  title: "Current location detected",
                  description: "Your current location has been added."
                });
              } else {
                // If reverse geocoding fails, just use coordinates as the location
                console.warn('Reverse geocoding returned no display_name, using fallback');
                const locationString = `Current Location [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`;
                setSearchInput('Current Location');
                onChange(locationString);
                
                toast({
                  title: "Current location detected",
                  description: "Your coordinates have been recorded, but we couldn't get an address."
                });
              }
            } catch (geocodeError) {
              // Handle reverse geocoding error but still keep the coordinates
              console.error('Error during reverse geocoding:', geocodeError);
              
              // Fall back to just coordinates
              const locationString = `Current Location [${latitude.toFixed(6)}, ${longitude.toFixed(6)}]`;
              setSearchInput('Current Location');
              onChange(locationString);
              
              toast({
                title: "Location partially detected",
                description: "We got your coordinates but couldn't find an address."
              });
            }
          } catch (error) {
            console.error('Error processing location data:', error);
            toast({
              title: "Location processing error",
              description: "Could not process your location data. Please try again or enter manually.",
              variant: "destructive"
            });
          } finally {
            setIsGettingLocation(false);
          }
        },
        (error) => {
          // Clear the safety timeout
          clearTimeout(locationTimeout);
          
          // Handle specific geolocation errors
          let title = "Location error";
          let message = "Unknown error getting your location.";
          let instruction = "Please try again or enter location manually.";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              title = "Location permission denied";
              message = "You need to allow location access to use this feature.";
              instruction = "Please check your browser/device settings and try again.";
              // Log more details about the environment for debugging
              console.error('Location permission denied. Browser:', navigator.userAgent);
              break;
            case error.POSITION_UNAVAILABLE:
              title = "Location unavailable";
              message = "Your current position could not be determined.";
              instruction = "Please check if location services are enabled on your device.";
              console.error('Position unavailable error details:', error.message);
              break;
            case error.TIMEOUT:
              title = "Location request timeout";
              message = "The request to get your location timed out.";
              instruction = "Please check your internet connection and try again.";
              console.error('Location timeout. Error details:', error.message);
              break;
            default:
              console.error('Unknown geolocation error:', error);
          }
          
          toast({
            title: title,
            description: `${message} ${instruction}`,
            variant: "destructive"
          });
          
          setIsGettingLocation(false);
        },
        {
          enableHighAccuracy: true, // Get the best possible result
          timeout: 12000,          // 12 seconds timeout (increased from 10)
          maximumAge: 0            // Don't use cached position
        }
      );
    } catch (criticalError) {
      // Handle unexpected critical errors in the geolocation API itself
      clearTimeout(locationTimeout);
      console.error('Critical error in geolocation system:', criticalError);
      toast({
        title: "Location system error",
        description: "A critical error occurred in the location system. Please try entering your location manually.",
        variant: "destructive"
      });
      setIsGettingLocation(false);
    }
  }, [onChange, toast]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Give a short delay to allow suggestion click to be processed first
      setTimeout(() => {
        if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
          setShowSuggestions(false);
        }
      }, 50);
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor={`location-input-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {label}
      </Label>
      
      <div className="relative w-full">
        <Input
          id={`location-input-${label.toLowerCase().replace(/\s+/g, '-')}`}
          ref={inputRef}
          value={searchInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pr-10"
          onFocus={() => {
            // Show suggestions again if we have them and input is focused
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
        />
        <Button 
          type="button"
          variant="ghost" 
          size="sm" 
          className="absolute right-0 top-0 h-full"
          onClick={handleSearch}
          disabled={isSearching || !searchInput.trim()}
        >
          <Search className={`h-4 w-4 ${isSearching ? 'animate-pulse' : ''}`} />
        </Button>
        
        {/* Location suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li 
                  key={index}
                  className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer truncate"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSuggestion(suggestion);
                  }}
                >
                  {suggestion.place_name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Current location button */}
      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={getCurrentLocation}
          disabled={isGettingLocation}
          className="w-full flex items-center justify-center gap-2"
        >
          {isGettingLocation ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Getting your location...
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4" />
              Use my current location
            </>
          )}
        </Button>
      </div>
      
      {value && (
        <div className="text-sm text-muted-foreground mt-1">
          <p className="truncate">
            <span className="font-medium">Selected:</span> {value.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}
          </p>
        </div>
      )}
    </div>
  );
};

export default MapLocationPicker;