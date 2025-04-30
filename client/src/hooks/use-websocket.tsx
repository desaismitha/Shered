import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

type WebSocketMessage = {
  type: string;
  message: string;
  [key: string]: any;
};

export function useWebSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<ExtendedWebSocket | null>(null);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!user) {
      if (socketRef.current) {
        console.log('User logged out - Closing WebSocket connection');
        socketRef.current.close();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Connect to WebSocket server
    const connectWebSocket = () => {
      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
      console.log('Connecting to WebSocket:', wsUrl);

      const socket = new WebSocket(wsUrl) as ExtendedWebSocket;
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connection established');
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          setLastMessage(data);

          // Handle different message types
          if (data.type === 'route-deviation') {
            // Show route deviation notification
            toast({
              title: 'Route Deviation Alert',
              description: data.message,
              variant: 'destructive',
              duration: 10000, // 10 seconds
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      socket.onclose = () => {
        console.log('WebSocket connection closed');
        setIsConnected(false);
        
        // Attempt to reconnect after 5 seconds, but only if user is logged in
        const timeoutId = setTimeout(() => {
          // We need to access the latest user value
          const userId = localStorage.getItem('userId');
          if (userId) {
            console.log('Attempting to reconnect WebSocket...');
            connectWebSocket();
          } else {
            console.log('User is logged out, not reconnecting WebSocket');
          }
        }, 5000);
        
        // Store the timeout ID for later cleanup if component unmounts
        socket.timeoutId = timeoutId;
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // The onclose handler will be called after this
      };
    };

    // Start connection
    if (!socketRef.current) {
      connectWebSocket();
    }

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        console.log('Component unmounting - Closing WebSocket connection');
        socketRef.current.close();
      }
    };
  }, [user, toast]);

  return {
    isConnected,
    lastMessage,
  };
}
