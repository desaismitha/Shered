import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, addDays, startOfDay, isEqual, isBefore, isAfter } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Compare dates ignoring time component - useful for form validation
export function compareDates(date1: Date | string | null | undefined, date2: Date | string | null | undefined): 'before' | 'after' | 'same' | 'invalid' {
  if (!date1 || !date2) return 'invalid';
  
  try {
    // Convert to Date objects if strings
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    
    // Create dates with only the date component (no time) in local timezone
    const day1 = startOfDay(d1);
    const day2 = startOfDay(d2);
    
    if (isEqual(day1, day2)) return 'same';
    if (isBefore(day1, day2)) return 'before';
    return 'after';
  } catch (e) {
    console.error("Error comparing dates:", e);
    return 'invalid';
  }
}

// Clean location string by removing any coordinates in brackets or parentheses
export function cleanLocationString(location: string | null | undefined): string {
  // Special case: handle 'Unknown location' directly
  if (!location || location === 'Unknown location') return 'Unknown location';
  
  // Remove any coordinates in square brackets like [47.6062, -122.3321]
  let cleaned = location.replace(/\[.*?\]/g, '');
  
  // Also remove any coordinates in parentheses like (47.6062, -122.3321)
  cleaned = cleaned.replace(/\(.*?\)/g, '');
  
  // Remove any trailing commas, whitespace, or other artifacts
  cleaned = cleaned.replace(/,\s*$/, '').trim();
  
  // If we've removed everything or ended up with an empty string, return Unknown location
  if (!cleaned || cleaned.length === 0) return 'Unknown location';
  
  return cleaned;
}

// Format time string or Date object to 12-hour format with AM/PM
export function formatTime(time: string | Date | null | undefined): string {
  if (!time) return '';
  
  try {
    // If it's a Date object, extract hours and minutes
    if (time instanceof Date) {
      const hours = time.getHours();
      const minutes = time.getMinutes().toString().padStart(2, '0');
      const isPM = hours >= 12;
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
    }
    
    // If it's a string, assume it's in 24-hour format (HH:MM)
    const [hours, minutes] = time.split(':');
    const hourInt = parseInt(hours);
    const isPM = hourInt >= 12;
    const hour12 = hourInt % 12 || 12;
    return `${hour12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return typeof time === 'string' ? time : '';
  }
}

// Function that detects if a date is our special marker date (2099-12-31)
export function isSpecialDateMarker(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    const day = date.getDate();
    
    return year === 2099 && month === 12 && day === 31;
  } catch (e) {
    console.error("Error checking for special date:", e);
    return false;
  }
}

// Function to normalize date displays independent of timezone
// This fixes the issue where dates appear one day earlier than selected
// and also preserves the time component when it exists
export function normalizeDate(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (typeof dateStr === 'string' && isSpecialDateMarker(dateStr)) return null;
  
  try {
    // Convert to Date object first
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    
    // Check if the date has a meaningful time component (not midnight UTC)
    const hasTimeComponent = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    
    if (hasTimeComponent) {
      // If the date already has a valid time component, preserve it
      // Create a new date to avoid reference issues
      return new Date(date);
    } else {
      // Create a date string in YYYY-MM-DD format to strip out time info
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateOnlyStr = `${year}-${month}-${day}`;
      
      // For dates that don't have a meaningful time component, set to noon local time
      // This ensures the date is the same in any timezone
      const result = new Date(dateOnlyStr);
      result.setHours(12, 0, 0, 0);
      return result;
    }
  } catch (e) {
    console.error("Error normalizing date:", e);
    return null;
  }
}

// Format a date range for display, handling special marker dates
export function formatDateRange(startDate: string | Date | null | undefined, endDate: string | Date | null | undefined): string {
  // If both dates are empty or special markers, return "No dates set"
  if ((!startDate && !endDate) || 
      (typeof startDate === 'string' && isSpecialDateMarker(startDate) && 
       typeof endDate === 'string' && isSpecialDateMarker(endDate))) {
    return "No dates set";
  }
  
  // Normalize and format the dates to avoid timezone issues
  const normalizedStartDate = normalizeDate(startDate);
  const normalizedEndDate = normalizeDate(endDate);
  
  // Format start date if it exists and was normalized
  const formattedStart = normalizedStartDate 
    ? format(normalizedStartDate, 'MMM d, yyyy')
    : null;
    
  // Format end date if it exists and was normalized
  const formattedEnd = normalizedEndDate
    ? format(normalizedEndDate, 'MMM d, yyyy')
    : null;
  
  // Handle cases where only one date is set
  if (formattedStart && !formattedEnd) {
    return `From ${formattedStart}`;
  }
  
  if (!formattedStart && formattedEnd) {
    return `Until ${formattedEnd}`;
  }
  
  // Both dates are set
  if (formattedStart && formattedEnd) {
    return `${formattedStart} - ${formattedEnd}`;
  }
  
  // This should never happen based on the checks above, but just in case
  return "Date information unavailable";
}
