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
import EditTripPage from "@/pages/trips/edit";
import BasicTripEditPage from "@/pages/basic-trip-edit";
import GroupsPage from "@/pages/groups-page";
import GroupDetailsPage from "@/pages/group-details-page";
import NewGroupPage from "@/pages/groups/new";
import ExpensesPage from "@/pages/expenses-page";
import MessagesPage from "@/pages/messages-page";
// Use inline components as temporary workaround
const ForgotPasswordPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
      <h1 className="text-2xl font-bold mb-4">Reset Password</h1>
      <p className="mb-4">Enter your email to receive a password reset link.</p>
      <div>
        <label className="block mb-2">Email</label>
        <input type="email" className="w-full p-2 border rounded mb-4" placeholder="your@email.com" />
      </div>
      <button className="w-full bg-primary-600 text-white py-2 rounded">Send Reset Link</button>
    </div>
  </div>
);

const ResetPasswordPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
      <h1 className="text-2xl font-bold mb-4">Create New Password</h1>
      <p className="mb-4">Enter a new password for your account.</p>
      <div>
        <label className="block mb-2">New Password</label>
        <input type="password" className="w-full p-2 border rounded mb-2" />
      </div>
      <div>
        <label className="block mb-2">Confirm Password</label>
        <input type="password" className="w-full p-2 border rounded mb-4" />
      </div>
      <button className="w-full bg-primary-600 text-white py-2 rounded">Update Password</button>
    </div>
  </div>
);
import { DbResetFloatingButton } from "@/components/ui/db-reset-floating-button";
import { Route } from "wouter";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/trips" component={TripsPage} />
      <ProtectedRoute path="/trips/new" component={NewTripPage} />
      <ProtectedRoute path="/trips/edit/:id" component={EditTripPage} />
      <ProtectedRoute path="/trips/basic-edit/:id" component={BasicTripEditPage} />
      <ProtectedRoute path="/trips/:id" component={TripDetailsPage} />
      <ProtectedRoute path="/groups/new" component={NewGroupPage} />
      <ProtectedRoute path="/groups/:id" component={GroupDetailsPage} />
      <ProtectedRoute path="/groups" component={GroupsPage} />
      <ProtectedRoute path="/expenses" component={ExpensesPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
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
