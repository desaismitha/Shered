import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertCircle, RefreshCw } from "lucide-react";

export function DbResetButton() {
  const { toast } = useToast();
  const [showButton, setShowButton] = useState(false);
  
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
    },
    onError: (error: Error) => {
      toast({
        title: "Database reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="mt-2 mb-4">
      {!showButton ? (
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowButton(true)}
          className="text-xs"
        >
          <AlertCircle className="h-3 w-3 mr-1" />
          Having connection issues?
        </Button>
      ) : (
        <div className="flex flex-col space-y-2 p-3 bg-muted/50 rounded-md">
          <p className="text-xs text-muted-foreground">
            If you're experiencing database connection issues, you can try resetting the connection pool.
            This might help resolve temporary connection problems.
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
              Reset Database Connection
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowButton(false)}
              disabled={isPending}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}