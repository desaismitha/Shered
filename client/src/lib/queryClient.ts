import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function extractErrorMessage(res: Response): Promise<string> {
  // Clone the response to avoid consuming it
  const resClone = res.clone();
  
  // Try to parse JSON response first
  try {
    const contentType = resClone.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const errorData = await resClone.json();
      if (errorData.message) {
        return errorData.message;
      }
    }
  } catch (jsonError) {
    console.error('Error parsing JSON error response:', jsonError);
  }
  
  // Fallback to text response
  try {
    const text = await res.text();
    return text || res.statusText;
  } catch (textError) {
    console.error('Error reading response text:', textError);
    return res.statusText || 'Unknown error';
  }
}

async function throwIfResNotOk(res: Response, ignore404 = false) {
  if (!res.ok) {
    // Optionally ignoring 404s if requested
    if (ignore404 && res.status === 404) {
      return;
    }
    
    const errorMessage = await extractErrorMessage(res);
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { ignore404?: boolean }
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, options?.ignore404);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Form the URL from query key components
    const baseUrl = queryKey[0] as string;
    const url = queryKey.length > 1 
      ? `${baseUrl}/${queryKey[1]}${queryKey.length > 2 ? `/${queryKey[2]}` : ''}`
      : baseUrl;
    
    console.log(`[Query] Fetching: ${url}`);
    
    // First check if we have this in the cache - for schedule details pages
    // Important optimization to prevent blank screens during loading
    if (url.startsWith('/api/schedules/') && queryClient) {
      // Check if we already have data for this schedule in the all schedules query
      const allSchedulesData = queryClient.getQueryData(['/api/schedules']);
      if (Array.isArray(allSchedulesData)) {
        const scheduleId = url.split('/').pop();
        const cachedSchedule = allSchedulesData.find(
          (schedule: any) => schedule.id === parseInt(scheduleId || '0')
        );
        
        if (cachedSchedule) {
          console.log(`[Query] Using cached data for quick rendering: ${url}`);
          return cachedSchedule;
        }
      }
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const res = await fetch(url, {
        credentials: "include",
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        console.log(`[Query] Got 401 for ${url}, returning null as requested`);
        return null;
      }
  
      await throwIfResNotOk(res);
      const data = await res.json();
      
      // Enhance response for schedule/trip queries
      if ((baseUrl === '/api/trips' || baseUrl === '/api/schedules') && queryKey.length > 1) {
        const userId = localStorage.getItem('userId'); // We'll use this as a fallback
        
        // If it's a trip detail query (has an ID), modify the response to include access level
        if (typeof data === 'object' && data && !data._accessLevel) {
          // If user is the creator, mark as owner
          const isOwner = data.createdBy?.toString() === userId?.toString();
          data._accessLevel = isOwner ? 'owner' : 'member';
          
          // Add display-friendly versions of locations if not present
          if (data.startLocation && !data.startLocationDisplay) {
            data.startLocationDisplay = data.startLocation.split('[')[0].trim();
          }
          if (data.destination && !data.destinationDisplay) {
            data.destinationDisplay = data.destination.split('[')[0].trim();
          }
        }
      }
      
      console.log(`[Query] Response for ${url}:`, data);
      return data;
    } catch (error: any) {
      // Handle timeout or network errors gracefully
      if (error.name === 'AbortError') {
        console.error(`[Query] Request timeout for ${url}`);
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Refresh on window focus
      staleTime: 30000, // Keep data fresh for 30 seconds
      retry: 1, // Retry once
      networkMode: 'offlineFirst', // Use cache while fetching
      // Apply optimizations for details pages
      ...(window.location.pathname.includes('/schedules/') && {
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        staleTime: 60000, // Cache for 1 minute for details pages
        cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      }),
      // For active trips list, be more aggressive about fetching fresh data
      ...(window.location.pathname.includes('/schedules') && !window.location.pathname.includes('/schedules/') && {
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchInterval: 10000, // 10 seconds
      }),
    },
    mutations: {
      retry: 1,
    },
  },
});
