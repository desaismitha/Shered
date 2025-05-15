import React, { createContext, ReactNode, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';

type WebSocketContextType = {
  isConnected: boolean;
  lastMessage: any;
  sendMessage: (data: any) => boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const socket = useRef<WebSocket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Only connect if we have a user
    if (!user) {
      if (socket.current) {
        socket.current.close();
        socket.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Create WebSocket connection
    if (!socket.current) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      
      try {
        socket.current = new WebSocket(wsUrl);
        
        socket.current.onopen = () => {
          console.log('WebSocket connection established');
          setIsConnected(true);
          
          // Send authentication information
          if (socket.current && user) {
            socket.current.send(JSON.stringify({ 
              type: 'auth', 
              userId: user.id 
            }));
          }
        };
        
        socket.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            setLastMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        socket.current.onclose = () => {
          console.log('WebSocket connection closed');
          setIsConnected(false);
          socket.current = null;
        };
        
        socket.current.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
      }
    }
    
    // Cleanup function
    return () => {
      if (socket.current) {
        console.log('Closing WebSocket connection');
        socket.current.close();
        socket.current = null;
      }
    };
  }, [user]);

  // Function to send messages
  const sendMessage = (data: any) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
