import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

// This is a utility function to get the human-readable location from coordinates
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    if (!response.ok) {
      throw new Error('Failed to fetch location data');
    }
    const data = await response.json();
    
    // Convert the response to a human-readable address
    let address = data.display_name || 'Unknown location';
    
    // Format with coordinates as hidden data
    // Store only first 3 parts of address to keep it concise,
    // but include coordinates in a hidden format that can be parsed later
    return `${address.split(',').slice(0, 3).join(',')} [${lat.toFixed(6)}, ${lng.toFixed(6)}]`;
  } catch (error) {
    console.error('Error fetching location data:', error);
    return `Selected Location [${lat.toFixed(6)}, ${lng.toFixed(6)}]`;
  }
}

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
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Array<{place_name: string, lat: number, lon: number}>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Parse coordinates from the value if they exist
  const [originalValue, setOriginalValue] = useState<string>(value);
  
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
      
      // Update search input with the readable part of the value
      let displayValue = value;
      if (displayValue.includes('[')) {
        displayValue = displayValue.substring(0, displayValue.indexOf('[')).trim();
      }
      setSearchInput(displayValue);
    } else {
      setOriginalValue('');
      setSearchInput('');
      setMarkerPosition(null);
    }
  }, [value]);

  // Handle search for locations
  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}`);
      if (!response.ok) {
        throw new Error('Failed to search location');
      }
      
      const results = await response.json();
      if (results && results.length > 0) {
        const { lat, lon } = results[0];
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lon);
        
        setMarkerPosition([latNum, lngNum]);
        const locationString = await reverseGeocode(latNum, lngNum);
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
  
  // Add effect to fetch location suggestions as user types
  useEffect(() => {
    // Hide suggestions if input is empty
    if (!searchInput || searchInput.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    const fetchSuggestions = async () => {
      try {
        setIsSearching(true);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}&limit=5`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }
        
        const results = await response.json();
        if (results && results.length > 0) {
          setSuggestions(results.map((item: any) => ({
            place_name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
          })));
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    };
    
    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 500); // shorter delay for suggestions
    
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
      
      {value && (
        <div className="text-sm text-muted-foreground mt-1">
          <p className="truncate">
            <span className="font-medium">Selected:</span> {value.replace(/\[.*\]/, '')}
          </p>
        </div>
      )}
    </div>
  );
};

export default MapLocationPicker;