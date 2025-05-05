import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OTPInput } from "../../components/ui/otp-input";
import { Loader2 } from "lucide-react";

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  phoneNumber: string;
}

export function PhoneVerificationModal({ 
  isOpen, 
  onClose, 
  onComplete, 
  phoneNumber
}: PhoneVerificationModalProps) {
  const { toast } = useToast();
  const [verificationCode, setVerificationCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayCode, setDisplayCode] = useState("");
  const [showCodeHelp, setShowCodeHelp] = useState(false);
  
  useEffect(() => {
    if (isOpen && phoneNumber) {
      // Request an OTP code when the modal opens
      sendVerificationCode();
    }
    return () => {
      // Reset state when the modal closes
      setVerificationCode("");
      setIsSubmitting(false);
      setDisplayCode("");
      setShowCodeHelp(false);
    };
  }, [isOpen, phoneNumber]);

  async function sendVerificationCode() {
    try {
      console.log("Requesting verification code for phone number:", phoneNumber);
      setIsSubmitting(true);
      
      // Send a request to the server to send an OTP to the phone number
      const response = await fetch("/api/verify/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }
      
      // Display the verification code for testing (in production, this would be sent via SMS)
      setDisplayCode(data.verificationCode || "");
      
      toast({
        title: "Verification code sent",
        description: `We've sent a verification code to ${phoneNumber}`,
      });
      
      setIsSubmitting(false);
    } catch (error: any) {
      console.error("Error sending verification code:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
      setIsSubmitting(false);
      setShowCodeHelp(true);
    }
  }

  async function verifyPhoneNumber() {
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter a valid 6-digit verification code",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Send a request to verify the OTP code
      const response = await fetch("/api/verify/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          verificationCode
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify code");
      }
      
      toast({
        title: "Phone verified",
        description: "Your phone number has been verified successfully",
      });
      
      // Call the onComplete callback to continue with trip creation/update
      onComplete();
      
      // Close the modal
      onClose();
    } catch (error: any) {
      console.error("Error verifying phone number:", error);
      toast({
        title: "Verification failed",
        description: error.message || "Failed to verify code",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Force a re-render of the Dialog when isOpen changes
  useEffect(() => {
    if (isOpen) {
      console.log("PHONE VERIFICATION MODAL IS OPEN!");
    }
  }, [isOpen]);
  
  return (
    // Use forceMount to ensure the Dialog is always rendered
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => !open && onClose()}
      modal={true}
    >
      <DialogContent 
        className="sm:max-w-md"
        forceMount
      >
        <DialogHeader>
          <DialogTitle>Verify your phone number</DialogTitle>
          <DialogDescription>
            We've sent a 6-digit verification code to {phoneNumber}.
            Please enter it below to verify your phone number for mobile notifications.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-4 space-y-4">
          <OTPInput 
            value={verificationCode} 
            onChange={setVerificationCode} 
            length={6} 
            disabled={isSubmitting}
          />
          
          {showCodeHelp && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">
                Having trouble receiving the code? Use this test code:
              </p>
              {displayCode ? (
                <div className="font-mono text-sm bg-muted p-2 rounded">
                  {displayCode}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No test code available. Please try again.
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-center mt-2">
            <Button
              variant="link"
              size="sm"
              disabled={isSubmitting}
              onClick={() => {
                setVerificationCode("");
                sendVerificationCode();
              }}
            >
              Resend code
            </Button>
          </div>
        </div>
        
        <DialogFooter className="flex sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={verifyPhoneNumber}
            disabled={verificationCode.length !== 6 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify phone number"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
