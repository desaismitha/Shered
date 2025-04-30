import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { OtpVerificationForm } from "@/components/auth/otp-verification-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get token from URL query parameter
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setIsVerifying(false);
      setErrorMessage("No verification token found in URL.");
    }
  }, [token]);

  const verifyToken = async (token: string) => {
    try {
      const response = await apiRequest("POST", "/api/verify-email", { token });
      
      if (response.ok) {
        setVerificationSuccess(true);
        toast({
          title: "Email verified",
          description: "Your email has been successfully verified.",
        });
      } else {
        const error = await response.json();
        setErrorMessage(error.message || "Token verification failed.");
        toast({
          title: "Verification failed",
          description: error.message || "Failed to verify your email.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      setErrorMessage("An unexpected error occurred during verification.");
      toast({
        title: "Error",
        description: "An unexpected error occurred during verification.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleContinueToApp = () => {
    navigate("/");
  };

  const handleGoToLogin = () => {
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Email Verification</CardTitle>
          <CardDescription>
            Verify your email to access all features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isVerifying ? (
            <div className="text-center py-6">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="mt-4">Verifying your email...</p>
            </div>
          ) : token ? (
            verificationSuccess ? (
              <div className="text-center py-6">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-xl font-semibold mt-4">
                  Email Verified!
                </h2>
                <p className="text-muted-foreground mt-2">
                  Your email has been successfully verified. You can now access all features of TravelGroupr.
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <XCircle className="h-16 w-16 mx-auto text-red-500" />
                <h2 className="text-xl font-semibold mt-4">
                  Verification Failed
                </h2>
                <p className="text-muted-foreground mt-2">
                  {errorMessage || "We couldn't verify your email. The token may be invalid or expired."}
                </p>
              </div>
            )
          ) : (
            <Tabs defaultValue="otp" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="otp">OTP Verification</TabsTrigger>
                <TabsTrigger value="email">Email Verification</TabsTrigger>
              </TabsList>

              <TabsContent value="otp" className="mt-4">
                <OtpVerificationForm 
                  onVerified={() => {
                    setVerificationSuccess(true);
                  }}
                />
              </TabsContent>

              <TabsContent value="email" className="mt-4">
                <div className="space-y-6 text-center">
                  <Mail className="w-16 h-16 mx-auto text-primary" />
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Check Your Email</h2>
                    <p className="text-muted-foreground">
                      We've sent a verification link to your email address. 
                      Please check your inbox and click the link to verify your account.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          {isVerifying ? null : (
            verificationSuccess ? (
              <Button onClick={handleContinueToApp}>
                Continue to App
              </Button>
            ) : token ? (
              <div className="space-y-4 w-full">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => window.location.href = "/verify-email"}
                >
                  Try Another Method
                </Button>
                <Button 
                  className="w-full" 
                  onClick={handleGoToLogin}
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  Already have an account?
                </p>
                <Link href="/auth">
                  <Button>
                    Go to Login
                  </Button>
                </Link>
              </div>
            )
          )}
        </CardFooter>
      </Card>
    </div>
  );
}