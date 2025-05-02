import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
};

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

type LoginData = z.infer<typeof loginSchema> & {
  invitation?: {
    token?: string;
    groupId?: string;
  };
};
type RegisterData = z.infer<typeof registerSchema> & {
  invitation?: {
    token?: string;
    groupId?: string;
  };
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  
  // Store userId in localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('userId', user.id.toString());
    }
  }, [user]);

  // Login mutation
  const loginMutation = useMutation<User, Error, LoginData>({
    mutationFn: async (credentials) => {
      try {
        console.log("Login mutation with credentials:", credentials);
        const res = await apiRequest("POST", "/api/login", credentials);
        return await res.json();
      } catch (error) {
        // Rethrow the error to be handled by onError
        console.error("Login error:", error);
        throw error;
      }
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/user"], userData);
      localStorage.setItem('userId', userData.id.toString());
      toast({
        title: "Login successful",
        description: `Welcome back, ${userData.displayName || userData.username}!`,
      });
    },
    onError: (error) => {
      console.error("Login error in onError handler:", error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Registration mutation
  const registerMutation = useMutation<User, Error, RegisterData>({
    mutationFn: async (credentials) => {
      try {
        // Remove confirmPassword before sending to API
        const { confirmPassword, ...userToRegister } = credentials;
        console.log('Register mutation with data:', JSON.stringify(userToRegister, null, 2));
        
        // Log invitation data if present
        if (userToRegister.invitation) {
          console.log('Invitation data included in registration:', 
            JSON.stringify(userToRegister.invitation, null, 2));
        }
        
        const res = await apiRequest("POST", "/api/register", userToRegister);
        return await res.json();
      } catch (error) {
        // Rethrow the error to be handled by onError
        console.error("Registration error:", error);
        throw error;
      }
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/user"], userData);
      localStorage.setItem('userId', userData.id.toString());
      toast({
        title: "Registration successful",
        description: `Welcome, ${userData.displayName || userData.username}!`,
      });
    },
    onError: (error) => {
      console.error("Registration error in onError handler:", error);
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await apiRequest("POST", "/api/logout");
      } catch (error) {
        // Rethrow the error to be handled by onError
        console.error("Logout error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      localStorage.removeItem('userId');
      toast({
        title: "Logged out successfully",
      });
    },
    onError: (error) => {
      console.error("Logout error in onError handler:", error);
      toast({
        title: "Logout failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}