import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, addDays } from 'date-fns';

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

// Function to normalize date displays independent of timezone
// This fixes the issue where dates appear one day earlier than selected
export function normalizeDate(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (isSpecialDateMarker(dateStr as string)) return null;
  
  try {
    // Convert to Date object first
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    
    // Create a date string in YYYY-MM-DD format to strip out time info
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateOnlyStr = `${year}-${month}-${day}`;
    
    // Parse this string back into a Date at noon UTC to avoid timezone issues
    return new Date(`${dateOnlyStr}T12:00:00Z`);
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
