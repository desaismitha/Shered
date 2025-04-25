import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface UserLookupResult {
  lookupByUsername: (username: string) => Promise<User | null>;
  lookupByEmail: (email: string) => Promise<User | null>;
  isLoading: boolean;
  error: Error | null;
}

export function useUserLookup(): UserLookupResult {
  const { toast } = useToast();
  
  const usernameMutation = useMutation<User | null, Error, string>({
    mutationFn: async (username: string) => {
      try {
        // Use the updated apiRequest with ignore404 option
        const res = await apiRequest("GET", `/api/users/by-username/${username}`, undefined, { ignore404: true });
        
        if (res.status === 404) {
          return null;
        }
        
        return await res.json();
      } catch (error) {
        console.log("Error in username lookup:", error);
        return null;
      }
    },
    onError: (error: Error) => {
      // Only show important errors
      if (!error.message.includes("not found")) {
        toast({
          title: "Error looking up user",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });
  
  const emailMutation = useMutation<User | null, Error, string>({
    mutationFn: async (email: string) => {
      try {
        // Use the updated apiRequest with ignore404 option
        const res = await apiRequest("GET", `/api/users/by-email/${encodeURIComponent(email)}`, undefined, { ignore404: true });
        
        if (res.status === 404) {
          return null;
        }
        
        return await res.json();
      } catch (error) {
        console.log("Error in email lookup:", error);
        return null;
      }
    },
    onError: (error: Error) => {
      // Only show important errors
      if (!error.message.includes("not found")) {
        toast({
          title: "Error looking up user",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });
  
  const lookupByUsername = async (username: string): Promise<User | null> => {
    try {
      const user = await usernameMutation.mutateAsync(username);
      return user;
    } catch (error) {
      console.error("Error looking up user by username:", error);
      return null;
    }
  };
  
  const lookupByEmail = async (email: string): Promise<User | null> => {
    try {
      const user = await emailMutation.mutateAsync(email);
      return user;
    } catch (error) {
      console.error("Error looking up user by email:", error);
      return null;
    }
  };
  
  return {
    lookupByUsername,
    lookupByEmail,
    isLoading: usernameMutation.isPending || emailMutation.isPending,
    error: usernameMutation.error || emailMutation.error,
  };
}