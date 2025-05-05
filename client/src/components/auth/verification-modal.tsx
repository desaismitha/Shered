import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OtpVerificationForm } from "./otp-verification-form";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";

interface VerificationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail?: string;
  userPhone?: string;
  registrationId?: string;
  onVerified?: () => void;
  smsSent?: boolean;
  verificationCode?: string; // Add this for development fallback
}

export function VerificationModal({ isOpen, onOpenChange, userEmail, userPhone, registrationId, onVerified, smsSent, verificationCode }: VerificationModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  const handleVerified = useCallback(() => {
    console.log('Verification modal: verification completed successfully');
    
    toast({
      title: "Verification successful",
      description: "Your account has been verified successfully.",
    });
    
    // CRITICAL: Force modal to close reliably
    document.body.click(); // This helps force close any open modals
    onOpenChange(false);
    
    // Small delay to ensure modal is closed before navigation
    setTimeout(() => {
      // If we have a custom onVerified callback (for new registration process), use it
      if (onVerified) {
        console.log('Calling custom verification callback');
        onVerified();
      } else {
        // Otherwise navigate to dashboard (for existing users verifying their account)
        // The home route is '/' which renders the DashboardPage component
        console.log('Navigating to dashboard after verification');
        setLocation("/");
      }
    }, 100);
  }, [toast, onOpenChange, onVerified, setLocation]);

  const handleSkipForNow = useCallback(() => {
    // For new registration, we shouldn't allow skipping verification
    // because the account hasn't been created yet
    if (registrationId) {
      toast({
        title: "Verification required",
        description: "You need to verify your email to complete registration.",
        variant: "destructive"
      });
      return;
    }
    
    // For existing accounts, allow skipping
    toast({
      title: "Verification skipped",
      description: "You can verify your account later from your profile.",
    });
    onOpenChange(false);
    // Navigate to home page (dashboard)
    setLocation("/");
  }, [registrationId, toast, onOpenChange, setLocation]);

  const handleResendVerificationEmail = useCallback(async () => {
    setIsResending(true);
    try {
      const response = await apiRequest("POST", "/api/resend-verification");
      
      if (response.ok) {
        toast({
          title: "Verification email sent",
          description: "A new verification link has been sent to your email address.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to send verification email.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error resending verification email:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  }, [toast, setIsResending]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{registrationId ? "Complete Registration" : "Verify Your Account"}</DialogTitle>
          <DialogDescription>
            {registrationId
              ? "Please verify your email to complete your account registration"
              : "Please verify your account to access all features of TravelGroupr"}
          </DialogDescription>
        </DialogHeader>

        <Tabs key="verification-tabs" defaultValue="otp" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="otp">Email Code</TabsTrigger>
            <TabsTrigger value="email">Email Link</TabsTrigger>
          </TabsList>

          <TabsContent value="otp" className="mt-4">
            {verificationCode && (
              <div className="mb-6 p-4 border border-blue-100 bg-blue-50 rounded-md">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Mail className="h-5 w-5 text-blue-600" />
                  <p className="text-sm text-blue-800 font-medium">Verification Code</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className="text-xl font-mono bg-white p-3 rounded-md border border-blue-200 tracking-widest shadow-sm">
                    {verificationCode}
                  </div>
                </div>
                <p className="text-xs text-blue-700 mt-3 text-center">
                  Enter this code below to verify your account.
                </p>
              </div>
            )}
            <OtpVerificationForm 
              onVerified={handleVerified}
              registrationId={registrationId}
              smsSent={smsSent}
              phoneNumber={userPhone}
            />
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <Mail className="w-12 h-12 mx-auto text-primary" />
                <h2 className="text-2xl font-semibold">Email Verification</h2>
                <p className="text-sm text-muted-foreground">
                  We've sent a verification link to:
                  <br />
                  <span className="font-medium">{userEmail || "your email address"}</span>
                </p>
                <p className="text-sm mt-4">
                  Please check your email inbox and click the verification link to complete the process.
                </p>
              </div>

              <div className="flex flex-col space-y-4">
                <Button
                  variant="outline"
                  onClick={handleResendVerificationEmail}
                  disabled={isResending}
                >
                  {isResending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Resend Verification Email"
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Only show the Skip button for existing users, not for new registration */}
        {!registrationId && (
          <DialogFooter className="flex justify-between mt-6">
            <Button
              variant="ghost"
              onClick={handleSkipForNow}
            >
              Skip for now
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}