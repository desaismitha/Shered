import { useState, useEffect, useCallback } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const otpFormSchema = z.object({
  otp: z.string().min(6, "OTP must be 6 digits").max(6),
});

type OtpFormValues = z.infer<typeof otpFormSchema>;

interface OtpVerificationFormProps {
  onVerified?: () => void;
  onCancel?: () => void;
  registrationId?: string;
  smsSent?: boolean;
  phoneNumber?: string;
  initialCode?: string; // For auto-filling the code
}

export function OtpVerificationForm({ onVerified, onCancel, registrationId, smsSent, phoneNumber, initialCode }: OtpVerificationFormProps) {
  const { toast } = useToast();
  const { user, registerCompleteMutation } = useAuth();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [userId, setUserId] = useState<number | undefined>(user?.id);
  
  // Get userId from URL query parameter if available (for direct verification without login)
  const searchParams = new URLSearchParams(window.location.search);
  const userIdParam = searchParams.get("userId");
  
  const form = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
      otp: "", // Never auto-fill verification code
    },
  });
  
  // Set userId from URL if available and not already set
  useEffect(() => {
    if (userIdParam && !userId) {
      setUserId(parseInt(userIdParam, 10));
    }
  }, [userIdParam, userId]);
  
  // Cleanup effect when unmounting  
  useEffect(() => {
    return () => {
      form.reset({ otp: "" });
    };
  }, [form]);
  
  // Removed auto-submit effect to require manual code entry

  const handleVerify = useCallback(async (values: OtpFormValues) => {
    // Different paths for registration verification vs. regular account verification
    // Registration verification uses registrationId, account verification uses userId
    if (!registrationId && !userId && !user?.id) {
      toast({
        title: "Error",
        description: "Unable to determine which account to verify",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      let response;
      
      if (registrationId) {
        // This is a new registration verification using the mutation from the auth hook
        console.log('Verifying registration with ID:', registrationId);
        try {
          // Get URL parameters for invitation data
          const searchParams = new URLSearchParams(window.location.search);
          const inviteToken = searchParams.get('token');
          const inviteGroupId = searchParams.get('groupId');
          
          // Build completion data with invitation parameters if available
          const completionData: any = {
            registrationId,
            otp: values.otp,
          };
          
          // Add invitation data if present
          if (inviteToken && inviteGroupId) {
            console.log('INVITATION: Including group invitation data in completion request:', { token: inviteToken, groupId: inviteGroupId });
            completionData.token = inviteToken;
            completionData.groupId = inviteGroupId;
            // Also include as nested property for maximum compatibility
            completionData.invitation = { token: inviteToken, groupId: inviteGroupId };
          }
          
          // Use the registerCompleteMutation from the auth hook
          await registerCompleteMutation.mutateAsync(completionData);
          
          console.log('Registration complete mutation successful');
          toast({
            title: "Success",
            description: "Your account has been verified",
          });
          
          // Important: Call onVerified and exit function immediately without any further processing
          if (onVerified) {
            // Set verifying to false immediately
            setIsVerifying(false);
            // Small delay to ensure state is updated before calling callback
            setTimeout(() => {
              onVerified();
            }, 100);
            return; // Exit immediately
          }
        } catch (err) {
          console.error("Registration verification request error:", err);
          toast({
            title: "Verification Error",
            description: err instanceof Error ? err.message : "There was a problem verifying your code. Please try again.",
            variant: "destructive",
          });
          // Clear the OTP field for retry
          form.reset({ otp: "" });
        }
      } else {
        // This is a verification for an existing account
        console.log('Verifying existing account');
        try {
          response = await apiRequest("POST", "/api/verify-otp", {
            userId: userId || user?.id,
            otp: values.otp,
          });
          
          if (response.ok) {
            toast({
              title: "Success",
              description: "Your account has been verified",
            });
            
            // Important: Call onVerified and exit function immediately without any further processing
            if (onVerified) {
              // Set verifying to false immediately
              setIsVerifying(false);
              // Small delay to ensure state is updated before calling callback
              setTimeout(() => {
                onVerified();
              }, 100);
              return; // Exit immediately
            }
          } else {
            const errorData = await response.json();
            toast({
              title: "Verification failed",
              description: errorData.message || "Invalid verification code",
              variant: "destructive",
            });
            // Clear the OTP field for retry
            form.reset({ otp: "" });
          }
        } catch (err) {
          console.error("Account verification request error:", err);
          toast({
            title: "Verification Error",
            description: "There was a problem verifying your code. Please try again.",
            variant: "destructive",
          });
          // Clear the OTP field for retry
          form.reset({ otp: "" });
        }
      }
    } catch (error) {
      console.error("OTP verification outer error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during verification",
        variant: "destructive",
      });
      // Clear the OTP field for retry
      form.reset({ otp: "" });
    } finally {
      setIsVerifying(false);
    }
  }, [registrationId, userId, user, toast, onVerified, registerCompleteMutation, form]);

  const handleResendOtp = useCallback(async () => {
    // Different handling for new registration vs. existing account verification
    if (!registrationId && !userId && !user) {
      toast({
        title: "Error",
        description: "Unable to determine which account to send code to",
        variant: "destructive",
      });
      return;
    }

    setIsResending(true);
    try {
      let response;
      
      if (registrationId) {
        // This is a new registration verification
        console.log('Resending OTP for registration ID:', registrationId);
        response = await apiRequest("POST", "/api/register/resend-otp", { registrationId });
      } else if (userId && !user) {
        // This is an existing account verification without user session
        console.log('Resending OTP for user ID (no session):', userId);
        response = await apiRequest("POST", "/api/request-otp", { userId });
      } else {
        // This is a verification for the logged-in user
        console.log('Resending OTP for logged-in user');
        response = await apiRequest("POST", "/api/request-otp");
      }

      if (response.ok) {
        toast({
          title: "Success",
          description: "A new verification code has been sent to your email",
        });
      } else {
        const data = await response.json();
        toast({
          title: "Failed to send code",
          description: data.message || "Could not send a new verification code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error requesting OTP:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  }, [registrationId, userId, user, toast]);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold">Enter Verification Code</h2>
        <p className="text-sm text-muted-foreground">
          We've sent a 6-digit verification code to your email address.
          Enter the code below to verify your account.
        </p>
        
        <div className="mt-2 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-xs">Check your email inbox for the code</span>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleVerify)} className="space-y-6">
          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem className="mx-auto max-w-xs">
                <FormLabel className="text-center block text-lg font-semibold">
                  Enter Verification Code
                </FormLabel>
                <div className="text-sm text-primary text-center mt-1 mb-2">
                  <>
                    <Mail className="inline-block mr-1 h-4 w-4" />
                    Check your email for a 6-digit code
                  </>
                </div>
                <FormControl>
                  <InputOTP maxLength={6} {...field}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col space-y-4">
            <Button type="submit" disabled={isVerifying}>
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                registrationId ? "Complete Registration" : "Verify Account"
              )}
            </Button>
            
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleResendOtp}
                disabled={isResending}
                className="w-1/2"
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Resend Code"
                )}
              </Button>
              
              {onCancel && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  className="w-1/2"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}