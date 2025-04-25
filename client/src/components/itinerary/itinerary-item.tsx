import { ItineraryItem as ItineraryItemType, User } from "@shared/schema";
import { MapPin, Clock, User as UserIcon, RepeatIcon, Car, ArrowRightIcon, CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ItineraryItemProps {
  item: ItineraryItemType;
  users: User[];
}

export function ItineraryItem({ item, users }: ItineraryItemProps) {
  // Find the user who created this item
  const createdByUser = users.find(user => user.id === item.createdBy);
  
  // Format time
  const formatTime = (timeString?: string) => {
    if (!timeString) return null;
    
    try {
      // Assuming timeString is in 24-hour format (HH:MM)
      const [hours, minutes] = timeString.split(':');
      const hourInt = parseInt(hours);
      const isPM = hourInt >= 12;
      const hour12 = hourInt % 12 || 12;
      return `${hour12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
    } catch (error) {
      return timeString;
    }
  };

  const startTime = formatTime(item.startTime);
  const endTime = formatTime(item.endTime);
  
  // Helper to determine the recurrence pattern display text
  const getRecurrenceText = () => {
    if (!item.isRecurring) return null;
    
    switch (item.recurrencePattern) {
      case 'daily':
        return 'Repeats daily';
      case 'weekdays':
        return 'Repeats weekdays (Mon-Fri)';
      case 'weekends':
        return 'Repeats weekends (Sat-Sun)';
      case 'specific-days':
        try {
          // Handle both string and array formats
          let days = item.recurrenceDays;
          if (typeof days === 'string') {
            days = JSON.parse(days);
          }
          
          if (Array.isArray(days) && days.length > 0) {
            // Map day codes to full day names
            const dayMap: Record<string, string> = {
              mon: 'Monday',
              tue: 'Tuesday',
              wed: 'Wednesday',
              thu: 'Thursday',
              fri: 'Friday',
              sat: 'Saturday',
              sun: 'Sunday'
            };
            
            // Format days to their full names and join with commas
            const dayNames = days.map(d => dayMap[d] || d).join(', ');
            return `Repeats on ${dayNames}`;
          }
          return 'Repeats on specific days';
        } catch (error) {
          console.error('Error parsing recurrence days:', error);
          return 'Repeats on specific days';
        }
      default:
        return 'Repeats regularly';
    }
  };
  
  // Determine if this is a pickup/dropoff activity
  const isPickupDropoff = item.fromLocation && item.toLocation;
  
  // Calculate background color based on item type
  const bgColorClass = isPickupDropoff
    ? 'bg-blue-50'
    : item.isRecurring
      ? 'bg-green-50'
      : 'bg-white';
  
  return (
    <div className={`p-4 border rounded-lg ${bgColorClass} hover:shadow-sm transition-shadow`}>
      <div className="flex justify-between">
        <div className="flex items-center">
          <h4 className="font-medium text-neutral-900 mb-1">{item.title}</h4>
          {item.isRecurring && (
            <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 border-green-200">
              <RepeatIcon className="h-3 w-3 mr-1" />
              Recurring
            </Badge>
          )}
          {isPickupDropoff && (
            <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-800 border-blue-200">
              <Car className="h-3 w-3 mr-1" />
              Transport
            </Badge>
          )}
        </div>
        {startTime && (
          <div className="text-xs text-neutral-500 flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {startTime}
            {endTime && ` - ${endTime}`}
          </div>
        )}
      </div>
      
      {item.description && (
        <p className="text-sm text-neutral-600 mt-1 mb-2">{item.description}</p>
      )}
      
      {/* Show pickup and dropoff locations if they exist */}
      {isPickupDropoff && (
        <div className="flex items-center text-sm text-neutral-700 my-2 bg-blue-50 p-2 rounded">
          <div className="flex items-center">
            <MapPin className="h-4 w-4 text-blue-500 mr-1" />
            <span>{item.fromLocation}</span>
          </div>
          <ArrowRightIcon className="h-4 w-4 mx-2 text-blue-500" />
          <div className="flex items-center">
            <MapPin className="h-4 w-4 text-blue-500 mr-1" />
            <span>{item.toLocation}</span>
          </div>
        </div>
      )}
      
      {/* Standard location display */}
      {!isPickupDropoff && item.location && (
        <div className="text-sm text-neutral-600 my-2 flex items-center">
          <MapPin className="h-4 w-4 mr-1 text-neutral-400" />
          {item.location}
        </div>
      )}
      
      {/* Recurrence pattern */}
      {item.isRecurring && (
        <div className="text-xs text-green-600 my-2 flex items-center">
          <CalendarIcon className="h-3 w-3 mr-1" />
          {getRecurrenceText()}
        </div>
      )}
      
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        <div className="text-xs text-neutral-500 flex items-center">
          <UserIcon className="h-3 w-3 mr-1" />
          Added by {createdByUser?.displayName || createdByUser?.username || "Unknown"}
        </div>
      </div>
    </div>
  );
}
