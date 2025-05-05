import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Redirect, Link } from "wouter";
import { useState, useEffect } from "react";
import { Plane } from "lucide-react";
import { VerificationModal } from "@/components/auth/verification-modal";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  username: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerInitMutation, registerCompleteMutation } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>("");
  const [registrationId, setRegistrationId] = useState<string>("");

  // Login form
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    }
  });

  // Get URL params for handling invitations
  const searchParams = new URLSearchParams(window.location.search);
  const inviteToken = searchParams.get('token');
  const inviteGroupId = searchParams.get('groupId');
  const inviteEmail = searchParams.get('email');
  const inviteMode = searchParams.get('mode');
  
  // Check if we need to wait for URL parameters to fully load
  useEffect(() => {
    // This helps ensure we properly capture URL parameters, especially in invitation flows
    if (window.location.pathname.includes('/auth/invite') && (!inviteToken || !inviteGroupId)) {
      console.log('Detected invite URL path but missing params - rechecking...');
      const recheckParams = new URLSearchParams(window.location.search);
      console.log('Full URL being processed:', window.location.href);
      console.log('Search params:', window.location.search);
      // Log all available query parameters
      recheckParams.forEach((value, key) => {
        console.log(`Param ${key}: ${value}`);
      });
    }
  }, [inviteToken, inviteGroupId]);
  
  // Debug log invitation parameters
  useEffect(() => {
    console.log('Auth page invitation parameters:', {
      token: inviteToken,
      groupId: inviteGroupId,
      email: inviteEmail,
      mode: inviteMode,
      fullUrl: window.location.href,
      urlSearchParams: window.location.search
    });
  }, [inviteToken, inviteGroupId, inviteEmail, inviteMode]);
  
  // If we have invite params, default to register tab
  useEffect(() => {
    if (inviteEmail || inviteToken || inviteMode === 'register') {
      setActiveTab("register");
      console.log("Detected invitation params, switching to register tab");
      console.log("Invitiation data to use:", {
        token: inviteToken,
        groupId: inviteGroupId,
        email: inviteEmail
      });
    }
  }, [inviteEmail, inviteToken, inviteMode, inviteGroupId]);
  
  // Register form with pre-filled email if coming from invitation
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: "",
      email: inviteEmail || "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    }
  });
  
  // Keep the email field updated if the URL params change
  useEffect(() => {
    if (inviteEmail) {
      registerForm.setValue("email", inviteEmail);
    }
  }, [inviteEmail, registerForm]);
  
  useEffect(() => {
    // Show verification modal if registration initialization is successful
    // but only if we're not already logged in (to prevent modal showing after logout)
    if (registerInitMutation.isSuccess && !user) {
      const data = registerInitMutation.data;
      setRegistrationId(data.registrationId);
      setRegisteredEmail(data.email);
      setShowVerificationModal(true);
    }
    
    // If user has successfully logged in, we should also reset the verification state
    if (user) {
      setShowVerificationModal(false);
      setRegistrationId("");
      setRegisteredEmail("");
    }
  }, [registerInitMutation.isSuccess, registerInitMutation.data, user]);
  
  useEffect(() => {
    // Redirect to dashboard when registration is complete
    if (registerCompleteMutation.isSuccess) {
      navigate('/dashboard');
    }
  }, [registerCompleteMutation.isSuccess, navigate]);
  
  // If user is already logged in, redirect to home
  if (user) {
    return <Redirect to="/" />;
  }

  // Submit handlers
  const onLoginSubmit = (values: LoginValues) => {
    // Add invitation data if present in URL params
    const invitationData: { token?: string; groupId?: string } = {};
    if (inviteToken) invitationData.token = inviteToken;
    if (inviteGroupId) invitationData.groupId = inviteGroupId;
    
    console.log("Login with invitation data:", invitationData);
    
    // Create the complete login data with both formats for maximum compatibility
    // 1. As a nested object under 'invitation'
    // 2. At the root level of the request
    const fullLoginData = {
      ...values,
      // Add invitation data in nested format if we have it
      ...(Object.keys(invitationData).length > 0 ? { invitation: invitationData } : {}),
      // Also add at root level
      ...(inviteToken ? { token: inviteToken } : {}),
      ...(inviteGroupId ? { groupId: inviteGroupId } : {})
    };
    
    // Log the complete data being sent to the server for debugging
    console.log("Complete login data being sent to server:", fullLoginData);
    
    loginMutation.mutate(fullLoginData, {
      onError: (error) => {
        console.log('Login error in component:', error);
      }
    });
  };

  const onRegisterSubmit = (values: RegisterValues) => {
    const { confirmPassword, ...registerData } = values;
    // We don't need to set registered email here, it's handled in the onSuccess callback
    
    // Add invitation data if present in URL params
    const invitationData: { token?: string; groupId?: string } = {};
    if (inviteToken) invitationData.token = inviteToken;
    if (inviteGroupId) invitationData.groupId = inviteGroupId;
    
    console.log("Registering with invitation data:", invitationData);
    
    // Create the complete registration data with both formats for maximum compatibility
    // 1. As a nested object under 'invitation'
    // 2. At the root level of the request
    const fullRegistrationData = {
      ...registerData,
      // Use email as the username
      username: values.email,
      confirmPassword: values.confirmPassword,
      // Add invitation data in nested format if we have it
      ...(Object.keys(invitationData).length > 0 ? { invitation: invitationData } : {}),
      // Also add at root level
      ...(inviteToken ? { token: inviteToken } : {}),
      ...(inviteGroupId ? { groupId: inviteGroupId } : {})
    };
    
    // Log the complete data being sent to the server for debugging
    console.log("Complete registration data being sent to server:", fullRegistrationData);
    
    // Use the new registration initialization mutation to start two-step verification
    registerInitMutation.mutate(fullRegistrationData, {
      onError: (error) => {
        console.log('Registration initialization error:', error);
      },
      // The effect that monitors registerInitMutation.isSuccess will handle the state updates and show the modal
      // This avoids redundant state updates
      onSuccess: (response) => {
        console.log('Registration initialization successful', {
          registrationId: response.registrationId,
          email: response.email,
          hasInvitation: !!inviteToken
        });
      }
    });
  };
  
  // Handler for when OTP verification is completed
  const handleOtpVerified = () => {
    // Since the OTP has already been verified in the verification component,
    // here we just need to navigate to the dashboard (or handle invitation flow)
    console.log('OTP verification completed successfully, redirecting to dashboard');
    
    // Reset verification state
    setShowVerificationModal(false);
    setRegistrationId('');
    setRegisteredEmail('');
    
    // Navigate to dashboard
    navigate('/');
  };
  

  return (
    <>
      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Auth form - left on desktop, top on mobile */}
        <div className="flex items-start md:items-center justify-center p-4 pt-0 md:p-8 md:w-1/2 order-last md:order-first">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">
                {activeTab === "login" ? "Welcome back" : "Create an account"}
              </CardTitle>
              <CardDescription className="text-center">
                {activeTab === "login" 
                  ? "Enter your credentials to sign in" 
                  : "Sign up to start planning trips with friends"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs 
                defaultValue="login" 
                value={activeTab} 
                onValueChange={(value) => setActiveTab(value as "login" | "register")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4 mt-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username/Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Username/Email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Password</FormLabel>
                              <Link href="/forgot-password">
                                <Button variant="link" className="px-0 text-sm h-auto" type="button">
                                  Forgot password?
                                </Button>
                              </Link>
                            </div>
                            <FormControl>
                              <Input type="password" placeholder="Password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign In"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
                
                <TabsContent value="register">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4 mt-4">
                      <FormField
                        control={registerForm.control}
                        name="displayName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Display Name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username/Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Username/Email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="Phone Number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={registerForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Confirm Password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={registerInitMutation.isPending}
                      >
                        {registerInitMutation.isPending ? "Sending verification..." : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-neutral-500">
                {activeTab === "login" 
                  ? "Don't have an account? " 
                  : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "login" ? "register" : "login")}
                  className="text-primary-600 hover:underline font-medium"
                >
                  {activeTab === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </CardFooter>
          </Card>
        </div>
        
        {/* Hero section - right on desktop, bottom on mobile */}
        <div className="bg-primary-600 text-white p-4 pt-3 md:p-12 md:w-1/2 flex flex-col justify-center order-first md:order-last">
          <div className="max-w-md mx-auto">
            <div className="flex items-center mb-3">
              <Plane className="h-6 w-6 mr-2" />
              <h1 className="text-2xl font-bold">TravelGroupr</h1>
            </div>
            <h2 className="text-xl md:text-3xl font-bold mb-3">
              Plan trips together, effortlessly
            </h2>
            <p className="text-primary-100 mb-3 text-sm">
              Create travel groups, coordinate plans, and make memories with friends.
              Plan together, travel better.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-primary-700/50 p-3 rounded-lg">
                <h3 className="font-medium mb-0.5 text-sm">Create travel groups</h3>
                <p className="text-xs text-primary-100">Organize groups for different companions</p>
              </div>
              <div className="bg-primary-700/50 p-3 rounded-lg">
                <h3 className="font-medium mb-0.5 text-sm">Plan itineraries</h3>
                <p className="text-xs text-primary-100">Build schedules everyone can access</p>
              </div>
              <div className="bg-primary-700/50 p-3 rounded-lg">
                <h3 className="font-medium mb-0.5 text-sm">Share expenses</h3>
                <p className="text-xs text-primary-100">Track and split costs between members</p>
              </div>
              <div className="bg-primary-700/50 p-3 rounded-lg">
                <h3 className="font-medium mb-0.5 text-sm">Coordinate activities</h3>
                <p className="text-xs text-primary-100">Vote on and organize activities</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Modal */}
      <VerificationModal 
        isOpen={showVerificationModal}
        onOpenChange={setShowVerificationModal}
        userEmail={registeredEmail}
        onVerified={handleOtpVerified}
        registrationId={registrationId}
      />
    </>
  );
}
