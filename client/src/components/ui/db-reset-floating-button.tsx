import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, AlertCircle } from "lucide-react";

export function DbResetFloatingButton() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  
  const { mutate: resetDb, isPending } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/db-reset");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to reset database connection");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Database reset successful",
        description: "The database connection pool has been reset. Try your operation again.",
        variant: "default",
      });
      
      // Auto-collapse after successful reset
      setTimeout(() => {
        setExpanded(false);
      }, 3000);
    },
    onError: (error: Error) => {
      toast({
        title: "Database reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!expanded) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setExpanded(true)}
        className="fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-md z-50 bg-primary text-white md:bottom-8"
      >
        <AlertCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 flex flex-col items-end md:bottom-8 z-50">
      <div className="bg-white rounded-lg shadow-md p-4 mb-2 w-64 border border-neutral-200">
        <h3 className="font-semibold text-sm mb-1">Database Connection Utility</h3>
        <p className="text-xs text-muted-foreground mb-3">
          If you're experiencing database connection issues, you can reset the connection pool.
        </p>
        <div className="flex space-x-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => resetDb()}
            disabled={isPending}
            className="text-xs"
          >
            {isPending ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Reset Connection
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            disabled={isPending}
            className="text-xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}