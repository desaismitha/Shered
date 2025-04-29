import React, { createContext, ReactNode, useContext } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';

type WebSocketContextType = {
  isConnected: boolean;
  lastMessage: any;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { isConnected, lastMessage } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage }}>
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
