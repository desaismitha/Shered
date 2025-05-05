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
  
  // New two-step registration process
  registerInitMutation: UseMutationResult<RegistrationInitResponse, Error, RegisterData>;
  registerCompleteMutation: UseMutationResult<User, Error, RegistrationCompleteData>;
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
  // Also allow these at root level
  token?: string;
  groupId?: string;
};
type RegisterData = z.infer<typeof registerSchema> & {
  invitation?: {
    token?: string;
    groupId?: string;
  };
  // Also allow these at root level
  token?: string;
  groupId?: string;
};

// Response from the registration initialization endpoint
type RegistrationInitResponse = {
  message: string;
  registrationId: string;
  email: string;
  otpSent: boolean;
  smsOtpSent?: boolean;
};

// Data required to complete registration with OTP verification
type RegistrationCompleteData = {
  registrationId: string;
  otp: string;
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
        
        // Enhanced debugging for invitation params
        if (credentials.invitation || credentials.token || credentials.groupId) {
          console.log("INVITATION DATA DETECTED in login:", {
            nested: credentials.invitation,
            rootToken: credentials.token,
            rootGroupId: credentials.groupId
          });
        }
        
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

  // Step 1: Initialize registration and send OTP
  const registerInitMutation = useMutation<RegistrationInitResponse, Error, RegisterData>({
    mutationFn: async (credentials) => {
      try {
        // Remove confirmPassword before sending to API
        const { confirmPassword, ...userToRegister } = credentials;
        console.log('Registration init mutation with data:', JSON.stringify(userToRegister, null, 2));
        
        // Enhanced debugging for invitation params
        if (userToRegister.invitation || userToRegister.token || userToRegister.groupId) {
          console.log("INVITATION DATA DETECTED in registration init:", {
            nested: userToRegister.invitation,
            rootToken: userToRegister.token,
            rootGroupId: userToRegister.groupId
          });
        }
        
        const res = await apiRequest("POST", "/api/register/init", userToRegister);
        
        // Handle non-200 responses properly
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Registration failed");
        }
        
        return await res.json();
      } catch (error) {
        // Rethrow the error to be handled by onError
        console.error("Registration init error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Verification code sent",
        description: `We've sent a code to ${data.email}. Enter it to complete your registration.`,
      });
    },
    onError: (error) => {
      console.error("Registration init error in onError handler:", error);
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "An account with this email may already exist",
        variant: "destructive",
      });
    },
  });
  
  // Step 2: Complete registration with OTP verification
  const registerCompleteMutation = useMutation<User, Error, RegistrationCompleteData>({
    mutationFn: async (data) => {
      try {
        console.log('Registration completion with data:', data);
        
        const res = await apiRequest("POST", "/api/register/complete", data);
        
        // Check if the response was successful
        if (!res.ok) {
          // Parse the error message from the response
          const errorData = await res.json();
          throw new Error(errorData.message || "Verification failed");
        }
        
        return await res.json();
      } catch (error) {
        // Rethrow the error to be handled by onError
        console.error("Registration completion error:", error);
        throw error;
      }
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/user"], userData);
      localStorage.setItem('userId', userData.id.toString());
      toast({
        title: "Registration completed",
        description: `Welcome to TravelGroupr, ${userData.displayName || userData.username}!`,
      });
    },
    onError: (error) => {
      console.error("Registration completion error in onError handler:", error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid verification code",
        variant: "destructive",
      });
    },
  });
  
  // Legacy registration mutation (keeping for backward compatibility)
  const registerMutation = useMutation<User, Error, RegisterData>({
    mutationFn: async (credentials) => {
      try {
        // Remove confirmPassword before sending to API
        const { confirmPassword, ...userToRegister } = credentials;
        console.log('Register mutation with data:', JSON.stringify(userToRegister, null, 2));
        
        // Enhanced debugging for invitation params
        if (userToRegister.invitation || userToRegister.token || userToRegister.groupId) {
          console.log("INVITATION DATA DETECTED in registration:", {
            nested: userToRegister.invitation,
            rootToken: userToRegister.token,
            rootGroupId: userToRegister.groupId
          });
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
      // Clear user data
      queryClient.setQueryData(["/api/user"], null);
      localStorage.removeItem('userId');
      
      // Also reset the state of registration mutations to prevent modal from showing after logout
      registerInitMutation.reset();
      registerCompleteMutation.reset();
      
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
        registerInitMutation,
        registerCompleteMutation,
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