import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

// Format a date range for display, handling special marker dates
export function formatDateRange(startDate: string | Date | null | undefined, endDate: string | Date | null | undefined): string {
  // If both dates are empty or special markers, return "No dates set"
  if ((!startDate && !endDate) || 
      (typeof startDate === 'string' && isSpecialDateMarker(startDate) && 
       typeof endDate === 'string' && isSpecialDateMarker(endDate))) {
    return "No dates set";
  }
  
  // Format start date if it exists and is not a special marker
  const formattedStart = startDate && !isSpecialDateMarker(startDate as string) 
    ? format(new Date(startDate), 'MMM d, yyyy')
    : null;
    
  // Format end date if it exists and is not a special marker
  const formattedEnd = endDate && !isSpecialDateMarker(endDate as string)
    ? format(new Date(endDate), 'MMM d, yyyy')
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
