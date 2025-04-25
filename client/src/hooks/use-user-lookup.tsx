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
  
  const usernameMutation = useMutation<User, Error, string>({
    mutationFn: async (username: string) => {
      try {
        const res = await apiRequest("GET", `/api/users/by-username/${username}`);
        return await res.json();
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error looking up user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const emailMutation = useMutation<User, Error, string>({
    mutationFn: async (email: string) => {
      try {
        const res = await apiRequest("GET", `/api/users/by-email/${encodeURIComponent(email)}`);
        return await res.json();
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error looking up user",
        description: error.message,
        variant: "destructive",
      });
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