import { Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import TripsPage from "@/pages/trips-page";
// Using unified trip page instead of separate pages
import UnifiedTripPage from "@/pages/unified-trip-page";
import GroupsPage from "@/pages/groups-page";
import GroupDetailsPage from "@/pages/group-details-page";
import NewGroupPage from "@/pages/groups/new";
import ExpensesPage from "@/pages/expenses-page";
import MessagesPage from "@/pages/messages-page";
import VehiclesPage from "@/pages/vehicles-page";
import ActiveTripsPage from "@/pages/active-trips-page";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import { DbResetFloatingButton } from "@/components/ui/db-reset-floating-button";
import { Route } from "wouter";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/trips" component={TripsPage} />
      <ProtectedRoute path="/trips/new" component={UnifiedTripPage} />
      <ProtectedRoute path="/trips/:tripId" component={UnifiedTripPage} />
      <ProtectedRoute path="/active-trips" component={ActiveTripsPage} />
      <ProtectedRoute path="/groups/new" component={NewGroupPage} />
      <ProtectedRoute path="/groups/:id" component={GroupDetailsPage} />
      <ProtectedRoute path="/groups" component={GroupsPage} />
      <ProtectedRoute path="/expenses" component={ExpensesPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/vehicles" component={VehiclesPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <DbResetFloatingButton />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
