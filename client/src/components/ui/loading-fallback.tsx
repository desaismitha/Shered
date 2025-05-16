import { AppShell } from "@/components/layout/app-shell";
import { Loader2 } from "lucide-react";

/**
 * A reusable loading fallback component that displays immediately
 * while data is being fetched
 */
export function LoadingFallback({ title = "Loading..." }: { title?: string }) {
  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex flex-col items-center justify-center space-y-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <h2 className="text-xl font-medium">{title}</h2>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * A skeleton loader component for the Schedule Details page
 */
export function ScheduleDetailsSkeleton() {
  return (
    <AppShell>
      <div className="container py-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-full bg-gray-200 skeleton-loader"></div>
          <div className="h-8 w-64 bg-gray-200 rounded skeleton-loader"></div>
        </div>
        
        <div className="max-w-5xl mx-auto">
          <div className="w-full grid grid-cols-4 gap-2 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-200 rounded skeleton-loader"></div>
            ))}
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="h-8 w-1/3 bg-gray-200 rounded skeleton-loader mb-4"></div>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 bg-gray-200 rounded skeleton-loader"></div>
                  <div className="h-6 w-full bg-gray-200 rounded skeleton-loader"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}