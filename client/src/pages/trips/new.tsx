import { AppShell } from "@/components/layout/app-shell";
import { SimpleTripForm } from "@/components/trips/simple-trip-form";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NewTripPage() {
  const [, navigate] = useLocation();

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-6 -ml-2"
          onClick={() => navigate("/trips")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to trips
        </Button>
        
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">Create a New Trip</h1>
        
        <div className="bg-white shadow rounded-lg p-6">
          <SimpleTripForm />
        </div>
      </div>
    </AppShell>
  );
}