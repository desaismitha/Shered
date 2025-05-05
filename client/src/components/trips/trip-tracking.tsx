import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, AlertTriangle, BellRing, Bell } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';

interface TripTrackingProps {
  tripId: number;
  tripName: string;
  isActive: boolean; // Only track when component is active/visible
}

interface LocationStatus {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: Date;
  isOnRoute?: boolean;
  distanceFromRoute?: number;
}

// This component handles location tracking for in-progress trips
export default function TripTracking({ tripId, tripName, isActive }: TripTrackingProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState<LocationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [routeDeviation, setRouteDeviation] = useState<{ isDeviated: boolean; distance: number } | null>(null);
  const [enableMobileNotifications, setEnableMobileNotifications] = useState(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('enableMobileNotifications');
      return stored === 'true';
    }
    return false;
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  
  // Function to handle new location data
  const handleLocationUpdate = useCallback(async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = new Date(position.timestamp);
    
    console.log(`New location: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
    
    // Update our state with the new location
    setLocation({
      latitude,
      longitude,
      accuracy,
      timestamp
    });
    
    // Reset any previous errors
    setError(null);
    
    try {
      // Send location update to the server
      const response = await apiRequest('POST', `/api/trips/${tripId}/location`, {
        latitude,
        longitude
      });
      
      const result = await response.json();
      
      // Check if we're deviating from the route
      if (result.routeStatus && !result.routeStatus.isOnRoute) {
        setRouteDeviation({
          isDeviated: true,
          distance: result.routeStatus.distanceFromRoute
        });
      } else {
        setRouteDeviation(null);
      }
      
      console.log('Location update sent successfully:', result);
    } catch (err) {
      console.error('Error sending location update:', err);
      setError('Failed to send location update to server');
    }
  }, [tripId]);
  
  // Handle geolocation errors
  const handleLocationError = useCallback((error: GeolocationPositionError) => {
    let message = 'Unknown error tracking location';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location tracking permission denied. Please enable location services to track this trip.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Location information is unavailable. Please check your device settings.';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out. Please try again.';
        break;
    }
    
    setError(message);
    setIsTracking(false);
    setWatchId(null);
    
    toast({
      title: 'Location Tracking Error',
      description: message,
      variant: 'destructive'
    });
  }, [toast]);
  
  // Start location tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };
    
    toast({
      title: 'Location Tracking Started',
      description: 'Your location is now being tracked for this trip.'
    });
    
    // Start watching position
    const id = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      options
    );
    
    setWatchId(id);
    setIsTracking(true);
  }, [handleLocationUpdate, handleLocationError, toast]);
  
  // Stop location tracking
  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsTracking(false);
      
      toast({
        title: 'Location Tracking Stopped',
        description: 'Your location is no longer being tracked for this trip.'
      });
    }
  }, [watchId, toast]);
  
  // Auto-start/stop tracking when component becomes active/inactive
  useEffect(() => {
    if (isActive && !isTracking && !watchId) {
      startTracking();
    } else if (!isActive && isTracking) {
      stopTracking();
    }
    
    // Clean up on unmount
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isActive, isTracking, watchId, startTracking, stopTracking]);
  
  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return false;
    }
    
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return true;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, []);
  
  // Show mobile notification with enhanced mobile device features
  const showMobileNotification = useCallback((title: string, body: string) => {
    if (enableMobileNotifications && notificationPermission === 'granted' && typeof Notification !== 'undefined') {
      try {
        // Create a notification
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico', // Default favicon as icon
          silent: false, // Allow system sound
          requireInteraction: false // Auto-close after a while
        });
        
        // Multiple vibration patterns for better attention on mobile
        if ('vibrate' in navigator) {
          // Short-Short-Long pattern that repeats twice for emphasis
          navigator.vibrate([200, 100, 200, 100, 500, 500, 200, 100, 200]);
          
          // Schedule another vibration after 2 seconds for persistent alerts
          setTimeout(() => {
            if ('vibrate' in navigator) {
              navigator.vibrate([200, 100, 200]);
            }
          }, 2000);
        }
        
        // Play a sound for audio feedback (especially useful for mobile devices)
        try {
          // Create a simple beep sound using the Web Audio API
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          // Configure the alert sound
          oscillator.type = 'sine';
          oscillator.frequency.value = 880; // A5 note
          gainNode.gain.value = 0.5; // Half volume
          
          // Short beep
          oscillator.start();
          setTimeout(() => oscillator.stop(), 200);
        } catch (audioError) {
          console.log('Audio alert not supported or blocked');
        }
        
        // Auto close after 8 seconds
        setTimeout(() => notification.close(), 8000);
        
        // Handle notification click
        notification.onclick = () => {
          // Focus the window and close the notification
          window.focus();
          notification.close();
        };
        
        return true;
      } catch (error) {
        console.error('Error showing notification:', error);
        return false;
      }
    }
    return false;
  }, [enableMobileNotifications, notificationPermission]);
  
  // Toggle mobile notifications
  const toggleMobileNotifications = useCallback(async () => {
    // If enabling notifications and permission not granted yet, request it
    if (!enableMobileNotifications && notificationPermission !== 'granted') {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast({
          title: 'Notification Permission Required',
          description: 'Please enable notifications to receive alerts on your mobile device.',
          variant: 'destructive'
        });
        return;
      }
    }
    
    const newValue = !enableMobileNotifications;
    setEnableMobileNotifications(newValue);
    
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableMobileNotifications', String(newValue));
    }
    
    toast({
      title: !enableMobileNotifications ? 'Mobile Notifications Enabled' : 'Mobile Notifications Disabled',
      description: !enableMobileNotifications 
        ? 'You will now receive notifications on your mobile device for route deviations.'
        : 'You will no longer receive mobile notifications for route deviations.'
    });
  }, [enableMobileNotifications, notificationPermission, requestNotificationPermission, toast]);
  
  // Setup WebSocket for real-time updates (deviation notifications, etc.)
  useEffect(() => {
    if (!isActive || !user) return;
    
    // WebSocket setup is handled in the app-level context, we just need to
    // listen for messages about this specific trip
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle route deviation notifications
        if (data.type === 'route-deviation' && data.tripId === tripId) {
          // Show toast notification
          toast({
            title: 'Route Deviation',
            description: data.message,
            variant: 'destructive'
          });
          
          // If mobile notifications are enabled, show a notification
          if (enableMobileNotifications) {
            showMobileNotification(
              'Route Deviation Alert', 
              `${data.message}. Distance from route: ${parseFloat(data.distanceFromRoute).toFixed(2)}km`
            );
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };
    
    // Setup WebSocket connection for notifications
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    const socket = new WebSocket(wsUrl);
    
    socket.addEventListener('message', handleWebSocketMessage);
    
    return () => {
      socket.removeEventListener('message', handleWebSocketMessage);
      socket.close();
    };
  }, [isActive, tripId, user, toast, enableMobileNotifications, showMobileNotification]);
  
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center">
          <MapPin className="mr-2" size={18} />
          Trip Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {routeDeviation && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Route Deviation</AlertTitle>
            <AlertDescription>
              You are currently {routeDeviation.distance.toFixed(2)}km away from the planned route.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium">Status</div>
              <div className="text-base">
                {isTracking ? (
                  <span className="text-green-600 font-medium">Tracking</span>
                ) : (
                  <span className="text-neutral-500">Not tracking</span>
                )}
              </div>
            </div>
            
            <div>
              <div className="text-sm font-medium">Last Update</div>
              <div className="text-base">
                {location ? (
                  <span>{location.timestamp.toLocaleTimeString()}</span>
                ) : (
                  <span className="text-neutral-500">No updates yet</span>
                )}
              </div>
            </div>
          </div>
          
          {location && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium">Coordinates</div>
                <div className="text-sm text-neutral-600 truncate">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </div>
              </div>
              
              <div>
                <div className="text-sm font-medium">Accuracy</div>
                <div className="text-sm text-neutral-600">
                  {location.accuracy ? `${location.accuracy.toFixed(1)}m` : 'Unknown'}
                </div>
              </div>
            </div>
          )}
          
          {/* Mobile notifications toggle */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-2">
                {notificationPermission === 'granted' ? (
                  <BellRing className="h-4 w-4 text-green-600" />
                ) : (
                  <Bell className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Mobile Notifications</div>
                  <div className="text-xs text-muted-foreground">
                    {notificationPermission === 'granted'
                      ? enableMobileNotifications
                        ? 'Enabled for route deviations'
                        : 'Permission granted but disabled'
                      : notificationPermission === 'denied'
                      ? 'Permission denied in browser settings'
                      : notificationPermission === 'unsupported'
                      ? 'Not supported on this device'
                      : 'Permission required'}
                  </div>
                </div>
              </div>
              <Switch
                checked={enableMobileNotifications && notificationPermission === 'granted'}
                disabled={notificationPermission === 'denied' || notificationPermission === 'unsupported'}
                onCheckedChange={toggleMobileNotifications}
              />
            </div>
            
            {/* Test notification button */}
            {enableMobileNotifications && notificationPermission === 'granted' && (
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => showMobileNotification(
                    'Test Notification', 
                    'This is a test notification. Your device is ready to receive route deviation alerts.'
                  )}
                  className="text-xs"
                >
                  <Bell className="h-3 w-3 mr-1" />
                  Test Notification
                </Button>
              </div>
            )}
          </div>
          
          {/* Tracking controls */}
          <div className="flex gap-3 pt-2">
            {!isTracking ? (
              <Button onClick={startTracking} className="flex-1">
                Start Tracking
              </Button>
            ) : (
              <Button onClick={stopTracking} variant="secondary" className="flex-1">
                Pause Tracking
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
