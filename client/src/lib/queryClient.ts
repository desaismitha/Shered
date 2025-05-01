import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response, ignore404 = false) {
  if (!res.ok) {
    // Optionally ignoring 404s if requested
    if (ignore404 && res.status === 404) {
      return;
    }
    
    // Try to parse JSON response first, as it might contain error message
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await res.json();
        if (errorData.message) {
          throw new Error(errorData.message);
        }
      }
    } catch (jsonError) {
      // If JSON parsing fails, continue with text response
    }
    
    // Fallback to text response
    const text = await res.text() || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      console.log(`[Query] Got 401 for ${url}, returning null as requested`);
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();
    
    // For trip queries, ensure access level is preserved and add a fallback
    if (baseUrl === '/api/trips' && queryKey.length > 1) {
      const userId = localStorage.getItem('userId'); // We'll use this as a fallback
      
      // If it's a trip detail query (has an ID), modify the response to include access level
      if (typeof data === 'object' && data && !data._accessLevel) {
        console.log(`[Query] Enhancing trip response with access level info`);
        // If user is the creator, mark as owner
        const isOwner = data.createdBy?.toString() === userId?.toString();
        data._accessLevel = isOwner ? 'owner' : 'member';
      }
    }
    
    console.log(`[Query] Response for ${url}:`, data);
    return data;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Refresh on window focus
      staleTime: 0, // Always treat data as stale
      retry: false,
      // For trips, be even more aggressive about fetching fresh data
      ...(window.location.pathname.includes('/trips') && {
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchInterval: 5000, // 5 seconds
      }),
    },
    mutations: {
      retry: false,
    },
  },
});
