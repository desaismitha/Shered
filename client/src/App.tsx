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
import TripDetailsPage from "@/pages/trip-details-page";
import NewTripPage from "@/pages/trips/new";
import GroupsPage from "@/pages/groups-page";
import GroupDetailsPage from "@/pages/group-details-page";
import NewGroupPage from "@/pages/groups/new";
import ExpensesPage from "@/pages/expenses-page";
import MessagesPage from "@/pages/messages-page";
import { Route } from "wouter";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/trips" component={TripsPage} />
      <ProtectedRoute path="/trips/new" component={NewTripPage} />
      <ProtectedRoute path="/trips/:id" component={TripDetailsPage} />
      <ProtectedRoute path="/groups/new" component={NewGroupPage} />
      <ProtectedRoute path="/groups/:id" component={GroupDetailsPage} />
      <ProtectedRoute path="/groups" component={GroupsPage} />
      <ProtectedRoute path="/expenses" component={ExpensesPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <Route path="/auth" component={AuthPage} />
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
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
