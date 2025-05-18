import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Check, ThumbsUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function FeedbackPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feedbackType, setFeedbackType] = useState<string>("suggestion");
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [email, setEmail] = useState<string>(user?.email || "");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedbackText.trim()) {
      toast({
        title: "Please enter your feedback",
        description: "We need to know what you think!",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // We'll simulate sending an email to the support address
      console.log("Sending feedback to shere.help@gmail.com:");
      console.log(`Type: ${feedbackType}`);
      console.log(`Feedback: ${feedbackText}`);
      console.log(`Reply-to: ${email}`);
      
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIsSubmitted(true);
      
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback! It has been sent to shere.help@gmail.com",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <AppShell>
        <div className="container max-w-3xl py-8">
          <Card className="shadow-md">
            <CardHeader className="pb-4 text-center">
              <CardTitle className="text-2xl">Feedback Submitted</CardTitle>
              <CardDescription>Thank you for sharing your thoughts with us!</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="rounded-full bg-green-100 p-4 mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg text-center mb-2">Your feedback has been received</p>
              <p className="text-sm text-center text-muted-foreground">
                We value your input and will use it to improve the TrustLoopz platform.
              </p>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button onClick={() => setIsSubmitted(false)} variant="outline" className="mr-2">
                Submit another feedback
              </Button>
              <Button onClick={() => window.location.href = "/"}>
                Return to Dashboard
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container max-w-3xl py-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ThumbsUp className="h-5 w-5 mr-2 text-primary" />
              Share Your Feedback
            </CardTitle>
            <CardDescription>
              Help us improve TrustLoopz by sharing your thoughts, suggestions, or reporting issues
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="feedbackType">Feedback Type</Label>
                <RadioGroup
                  value={feedbackType}
                  onValueChange={setFeedbackType}
                  className="grid grid-cols-3 gap-4"
                >
                  <div>
                    <RadioGroupItem 
                      value="suggestion" 
                      id="suggestion" 
                      className="peer sr-only" 
                    />
                    <Label
                      htmlFor="suggestion"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <div className="text-center">Suggestion</div>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem 
                      value="issue" 
                      id="issue" 
                      className="peer sr-only" 
                    />
                    <Label
                      htmlFor="issue"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <div className="text-center">Issue</div>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem 
                      value="other" 
                      id="other" 
                      className="peer sr-only" 
                    />
                    <Label
                      htmlFor="other"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                      <div className="text-center">Other</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback">Your Feedback</Label>
                <Textarea
                  id="feedback"
                  placeholder={
                    feedbackType === "suggestion"
                      ? "I'd like to suggest..."
                      : feedbackType === "issue"
                      ? "I'm experiencing an issue with..."
                      : "I'd like to share..."
                  }
                  className="min-h-[150px]"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Your Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email if you'd like us to follow up"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  We'll only use this to respond to your feedback if needed
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFeedbackText("");
                  setFeedbackType("suggestion");
                }}
              >
                Clear Form
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}