import { Switch, Redirect } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { WebSocketProvider } from "@/components/providers/websocket-provider";
import { ProtectedRoute } from "@/lib/protected-route";
import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import TripsPage from "@/pages/trips-page-simple"; // Using as SchedulesPage 
// Using unified schedule page instead of separate pages
import UnifiedTripPage from "@/pages/unified-trip-page"; // For creating new schedules

// Lazy-load the Schedule Details page to prevent blank screen issues
const ScheduleDetailsPage = lazy(() => import("@/pages/schedule-details-page"));
import EventPage from "@/pages/event-page";
import TripsDebugPage from "@/pages/trips-debug-page"; // Using as SchedulesDebugPage
import ActiveTripsDebug from "@/pages/active-trips-debug"; // Using as ActiveSchedulesDebug
import GroupsPage from "@/pages/groups-page";
import GroupDetailsPage from "@/pages/group-details-page";
import NewGroupPage from "@/pages/groups/new";
import ExpensesPage from "@/pages/expenses-page";
import MessagesPage from "@/pages/messages-page";
import VehiclesPage from "@/pages/vehicles-page";
import DriversPage from "@/pages/drivers-page"; // New Drivers page
import ActiveTripsPage from "@/pages/active-trips-page"; // Using as ActiveSchedulesPage
import CheckInPage from "@/pages/check-in-page";
import ProfilePage from "@/pages/profile-page";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email-page";
import BulkImportPage from "@/pages/bulk-import-page";
import { DbResetFloatingButton } from "@/components/ui/db-reset-floating-button";
import { Route } from "wouter";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/schedules" component={TripsPage} />
      <ProtectedRoute path="/schedules/new" component={UnifiedTripPage} />
      <ProtectedRoute 
        path="/schedules/:scheduleId" 
        component={() => (
          <Suspense fallback={
            <div className="flex flex-col h-screen w-full items-center justify-center bg-background">
              <div className="flex items-center mb-4">
                <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                <span className="ml-3 text-xl font-medium">Loading schedule details...</span>
              </div>
              <div className="max-w-md text-center text-muted-foreground">
                Preparing your schedule information and optimizing display for the best experience
              </div>
            </div>
          }>
            <ScheduleDetailsPage />
          </Suspense>
        )} 
      />
      <ProtectedRoute path="/events/new" component={EventPage} />
      <ProtectedRoute path="/events/:eventId" component={EventPage} />
      <ProtectedRoute path="/active-schedules" component={ActiveTripsPage} />
      <ProtectedRoute path="/check-in" component={CheckInPage} />
      <ProtectedRoute path="/groups/new" component={NewGroupPage} />
      <ProtectedRoute path="/groups/:id" component={GroupDetailsPage} />
      <ProtectedRoute path="/groups" component={GroupsPage} />
      <ProtectedRoute path="/expenses" component={ExpensesPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/vehicles" component={VehiclesPage} />
      <ProtectedRoute path="/drivers" component={DriversPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/bulk-import" component={BulkImportPage} />
      <ProtectedRoute path="/schedules-debug" component={TripsDebugPage} />
      <ProtectedRoute path="/active-schedules-debug" component={ActiveTripsDebug} />
      
      {/* Backward compatibility routes - redirects from old URL patterns */}
      <Route path="/trips">
        {() => <Redirect to="/schedules" />}
      </Route>
      <Route path="/trips/new">
        {() => <Redirect to="/schedules/new" />}
      </Route>
      <Route path="/trips/:id">
        {(params) => {
          // Get the current URL to preserve query parameters
          const currentLocation = window.location.toString();
          const queryString = currentLocation.includes('?') 
            ? currentLocation.substring(currentLocation.indexOf('?')) 
            : '';
          return <Redirect to={`/schedules/${params.id}${queryString}`} />;
        }}
      </Route>
      <Route path="/active-trips">
        {() => <Redirect to="/active-schedules" />}
      </Route>
      <Route path="/trips-debug">
        {() => <Redirect to="/schedules-debug" />}
      </Route>
      <Route path="/active-trips-debug">
        {() => <Redirect to="/active-schedules-debug" />}
      </Route>
      
      <Route path="/auth" component={AuthPage} />
      <Route path="/invite/:groupId/:token">
        {(params) => {
          console.log("Invite route detected with params:", params);
          const { groupId, token } = params;
          
          // Get email from URL query params if present
          const searchParams = new URLSearchParams(window.location.search);
          const email = searchParams.get('email');
          
          console.log("Invitation processing with:", { groupId, token, email });
          
          // Force logout any existing session before redirecting to auth page
          // This ensures that the invitation flow always starts fresh
          fetch('/api/logout', { method: 'POST' })
            .then(() => {
              console.log("Forced logout for invitation flow");
              // Include email in the redirect if it exists
              const authUrl = `/auth?token=${token}&groupId=${groupId}&mode=register${email ? `&email=${encodeURIComponent(email)}` : ''}`;
              console.log("Redirecting to:", authUrl);
              window.location.href = authUrl;
            })
            .catch(err => {
              console.error("Error during forced logout:", err);
              // Include email in the redirect if it exists
              const authUrl = `/auth?token=${token}&groupId=${groupId}&mode=register${email ? `&email=${encodeURIComponent(email)}` : ''}`;
              console.log("Redirecting to (after error):", authUrl);
              window.location.href = authUrl;
            });
          return <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Processing Invitation</h2>
              <p className="text-gray-600">Please wait while we prepare your invitation...</p>
            </div>
          </div>;
        }}
      </Route>
      {/* Catch all other invite paths and redirect to auth */}
      <Route path="/invite">
        {() => <Redirect to="/auth" />}
      </Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <DbResetFloatingButton />
          </TooltipProvider>
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
