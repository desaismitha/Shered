import { useWebSocketContext } from "@/components/providers/websocket-provider";
import { useAuth } from "@/hooks/use-auth";
import { Wifi, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function WebSocketIndicator() {
  const { isConnected } = useWebSocketContext();
  const { user } = useAuth();

  // Only show the indicator if user is logged in
  if (!user) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center cursor-help">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isConnected 
              ? "Connected to real-time updates"
              : "Disconnected from real-time updates"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
