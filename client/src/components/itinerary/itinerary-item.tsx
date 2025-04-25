import { ItineraryItem as ItineraryItemType, User } from "@shared/schema";
import { MapPin, Clock, User as UserIcon } from "lucide-react";

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
  
  return (
    <div className="p-4 border rounded-lg bg-white hover:shadow-sm transition-shadow">
      <div className="flex justify-between">
        <h4 className="font-medium text-neutral-900 mb-1">{item.title}</h4>
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
      
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        {item.location && (
          <div className="text-xs text-neutral-500 flex items-center">
            <MapPin className="h-3 w-3 mr-1" />
            {item.location}
          </div>
        )}
        
        <div className="text-xs text-neutral-500 flex items-center">
          <UserIcon className="h-3 w-3 mr-1" />
          Added by {createdByUser?.displayName || createdByUser?.username || "Unknown"}
        </div>
      </div>
    </div>
  );
}
