import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const VerifyEmailPage = () => {
  const [location, setLocation] = useLocation();
  const [verificationStatus, setVerificationStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");

        if (!token) {
          setVerificationStatus("error");
          setErrorMessage("Verification token is missing.");
          return;
        }

        // Call the verification endpoint
        const response = await apiRequest("GET", `/api/verify-email?token=${token}`);
        
        if (response.ok) {
          setVerificationStatus("success");
        } else {
          const data = await response.json();
          setVerificationStatus("error");
          setErrorMessage(data.message || "Email verification failed.");
        }
      } catch (error) {
        console.error("Email verification error:", error);
        setVerificationStatus("error");
        setErrorMessage("An unexpected error occurred during verification.");
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Email Verification</CardTitle>
          <CardDescription>
            Verifying your email with TravelGroupr
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-6">
          {verificationStatus === "loading" && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
              <p className="text-center text-muted-foreground">Verifying your email address...</p>
            </div>
          )}

          {verificationStatus === "success" && (
            <div className="flex flex-col items-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <div className="text-center">
                <h3 className="text-xl font-semibold">Verification Successful!</h3>
                <p className="text-muted-foreground mt-2">
                  Your email has been successfully verified. You can now access all features of TravelGroupr.
                </p>
              </div>
            </div>
          )}

          {verificationStatus === "error" && (
            <div className="flex flex-col items-center space-y-4">
              <XCircle className="w-16 h-16 text-red-500" />
              <div className="text-center">
                <h3 className="text-xl font-semibold">Verification Failed</h3>
                <p className="text-muted-foreground mt-2">{errorMessage}</p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          {verificationStatus === "success" && (
            <Button onClick={() => setLocation("/dashboard")}>
              Go to Dashboard
            </Button>
          )}
          
          {verificationStatus === "error" && (
            <div className="flex flex-col items-center gap-4">
              <Button onClick={() => setLocation("/auth")}>
                Return to Login
              </Button>
              <p className="text-sm text-muted-foreground">
                If you're already logged in, you can request a new verification email from your profile.
              </p>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default VerifyEmailPage;