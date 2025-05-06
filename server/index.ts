import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { checkDbConnection, attemptReconnect } from "./db";
import { storage } from "./storage";
import { sendRouteDeviationEmail } from "./email";

// Helper functions for route deviation checks
function parseCoordinates(locationStr: string | null | undefined): { lat: number, lng: number } | null {
  if (!locationStr) return null;
  
  // Try the new format with square brackets [lat, lng]
  let coordsRegex = /\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/;
  let match = locationStr.match(coordsRegex);
  
  // If not found, try the old format with parentheses (lat, lng)
  if (!match) {
    coordsRegex = /\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/;
    match = locationStr.match(coordsRegex);
  }
  
  if (match && match.length === 3) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  
  return null;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  // Haversine formula
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  
  return distance;
}

function isLocationOnRoute(
  pointLat: number,
  pointLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  toleranceKm: number = 5.0 // Default 5km tolerance
): { isOnRoute: boolean; distanceFromRoute: number } {
  try {
    console.log(`[ROUTE-CHECK] Computing distance for point (${pointLat}, ${pointLon}) to route from (${startLat}, ${startLon}) to (${endLat}, ${endLon})`);
    
    // Input validation - if any coordinate is NaN, use a simpler distance check
    if (isNaN(pointLat) || isNaN(pointLon) || 
        isNaN(startLat) || isNaN(startLon) || 
        isNaN(endLat) || isNaN(endLon)) {
      console.log(`[ROUTE-CHECK] Invalid coordinates detected, using simple distance check`);
      
      // Use distance to start point as fallback
      const distToStart = isNaN(startLat) || isNaN(startLon) ? 999 : 
                          calculateDistance(pointLat, pointLon, startLat, startLon);
      return {
        isOnRoute: distToStart <= toleranceKm,
        distanceFromRoute: distToStart
      };
    }
    
    // Check for trivial case where route points are the same
    if (startLat === endLat && startLon === endLon) {
      const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
      console.log(`[ROUTE-CHECK] Start and end points are the same. Distance: ${distanceToStart} km`);
      return {
        isOnRoute: distanceToStart <= toleranceKm,
        distanceFromRoute: distanceToStart
      };
    }
    
    // Algorithm to find closest point on the line to our point
    // First, convert lat/lng to a simple 2D coordinate system for calculation
    const x = pointLat;
    const y = pointLon;
    const x1 = startLat;
    const y1 = startLon;
    const x2 = endLat;
    const y2 = endLon;

    // Calculate the line segment length squared
    const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    // Extra check for very small line segments
    if (lenSq < 0.000001) { // Practically zero length
      const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
      console.log(`[ROUTE-CHECK] Route segment is too short. Using distance to start: ${distanceToStart} km`);
      return {
        isOnRoute: distanceToStart <= toleranceKm,
        distanceFromRoute: distanceToStart
      };
    }
    
    // Calculate projection of point onto line
    let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lenSq;
    console.log(`[ROUTE-CHECK] Projection parameter t: ${t}`);
    
    // Clamp t to line segment
    t = Math.max(0, Math.min(1, t));
    console.log(`[ROUTE-CHECK] Clamped projection parameter t: ${t}`);
    
    // Calculate projection coordinates
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    console.log(`[ROUTE-CHECK] Projection point: (${projX}, ${projY})`);
    
    // Calculate actual distance using haversine formula
    const distanceFromRoute = calculateDistance(
      pointLat,
      pointLon,
      projX,
      projY
    );
    
    console.log(`[ROUTE-CHECK] Distance from route: ${distanceFromRoute} km, Tolerance: ${toleranceKm} km`);
    
    return {
      isOnRoute: distanceFromRoute <= toleranceKm,
      distanceFromRoute
    };
  } catch (error) {
    console.error(`[ROUTE-CHECK] Error calculating route distance:`, error);
    // Return a safe default
    return {
      isOnRoute: false,
      distanceFromRoute: 999 // A large value to indicate we couldn't calculate
    };
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from the public directory
app.use('/test', express.static(path.join(process.cwd(), 'public')));
// Serve direct access test files
app.use('/direct-test', express.static(path.join(process.cwd(), 'public/direct-test')));

app.use((req, res, next) => {
  // Log all request paths and queries for debugging
  if (req.path.startsWith('/auth') || req.path.startsWith('/api/login') || req.path.startsWith('/api/register')) {
    console.log(`[AUTH-DEBUG] ${req.method} ${req.path}${req.query ? ' Query: ' + JSON.stringify(req.query) : ''}`);
  }
  
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Database health check endpoint
  app.get("/api/health/db", async (_req, res) => {
    try {
      const connected = await checkDbConnection();
      if (connected) {
        return res.status(200).json({ status: "healthy", database: "connected" });
      } else {
        return res.status(503).json({ status: "degraded", database: "disconnected" });
      }
    } catch (error) {
      const err = error as Error;
      return res.status(500).json({ 
        status: "error", 
        database: "error", 
        message: err.message || "Unknown error" 
      });
    }
  });

  // Special debug endpoint for route deviation testing
  app.get("/api/debug/route-deviation", async (req, res) => {
    try {
      // Allow this endpoint to be accessed without authentication for debugging
      
      // Get parameters with defaults for easier debugging
      const lat = parseFloat(req.query.lat as string || "47.643");
      const lng = parseFloat(req.query.lng as string || "-122.063");
      const tripId = parseInt(req.query.tripId as string || "37");
      
      console.log(`[DEBUG] Received parameters: lat=${lat}, lng=${lng}, tripId=${tripId}`);
      
      // Get the trip
      const trip = await storage.getTrip(tripId);
      console.log(`[DEBUG] Retrieved trip:`, trip);
      
      if (!trip) {
        return res.status(200).json({
          success: false,
          error: "Trip not found",
          tripId: tripId, 
          requestedParameters: { lat, lng }
        });
      }
      
      // Extract coordinates from the trip start and end locations
      const startCoords = parseCoordinates(trip.startLocation);
      const endCoords = parseCoordinates(trip.destination);
      
      console.log(`[DEBUG] Trip locations:\n  - Start: ${trip.startLocation}\n  - End: ${trip.destination}`);
      console.log(`[DEBUG] Parsed coordinates:\n  - Start: ${JSON.stringify(startCoords)}\n  - End: ${JSON.stringify(endCoords)}`);
      
      // Return all the data for debugging
      return res.status(200).json({
        success: true,
        tripData: trip,
        parsedCoordinates: {
          start: startCoords,
          end: endCoords
        },
        enableMobileNotifications: trip.enableMobileNotifications,
        requestParams: { lat, lng, tripId }
      });
    } catch (error) {
      console.error("[DEBUG] Error in debug endpoint:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
  
  // Test endpoint for route deviation notifications
  app.get("/api/test/route-deviation", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          error: "Not authenticated",
          details: "You must be logged in to use this endpoint"
        });
      }
      
      // Get parameters
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const tripId = parseInt(req.query.tripId as string);
      
      if (isNaN(lat) || isNaN(lng) || isNaN(tripId)) {
        return res.status(400).json({
          error: "Invalid parameters",
          details: "Please provide valid lat, lng, and tripId values"
        });
      }
      
      // Get the trip
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({
          error: "Trip not found",
          details: `Trip with ID ${tripId} does not exist`
        });
      }
      
      // Extract coordinates from the trip start and end locations
      const startCoords = parseCoordinates(trip.startLocation);
      const endCoords = parseCoordinates(trip.destination);
      
      // Log coordinate extraction for debugging
      console.log(`[TEST] Trip ${tripId} locations: \n  - Start: ${trip.startLocation}\n  - End: ${trip.destination}`);
      console.log(`[TEST] Extracted coordinates: \n  - Start: ${startCoords ? `${startCoords.lat}, ${startCoords.lng}` : 'null'}\n  - End: ${endCoords ? `${endCoords.lat}, ${endCoords.lng}` : 'null'}`);
      
      if (!startCoords || !endCoords) {
        return res.status(400).json({
          error: "Invalid trip locations",
          details: "The trip does not have valid coordinates in its start or end locations"
        });
      }
      
      // Check if the location is on the route
      console.log(`[TEST] Running route check with parameters:\n` +
                 `  - Test point: (${lat}, ${lng})\n` +
                 `  - Start point: (${startCoords.lat}, ${startCoords.lng})\n` +
                 `  - End point: (${endCoords.lat}, ${endCoords.lng})\n` +
                 `  - Tolerance: 5.0 km`);
      
      // Direct distance calculation as a fallback
      const distToStart = calculateDistance(lat, lng, startCoords.lat, startCoords.lng);
      const distToEnd = calculateDistance(lat, lng, endCoords.lat, endCoords.lng);
      const routeLength = calculateDistance(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng);
      
      console.log(`[TEST] Direct distances: distToStart=${distToStart.toFixed(2)}km, distToEnd=${distToEnd.toFixed(2)}km, routeLength=${routeLength.toFixed(2)}km`);
      
      // Simple deviation calculation
      const deviation = Math.min(distToStart, distToEnd);
      const isOnRoute = deviation <= 5.0;
      
      // Create a reliable route check result
      const routeCheck = {
        isOnRoute: isOnRoute,
        distanceFromRoute: deviation
      };
      
      console.log(`[TEST] Route check result: ${JSON.stringify(routeCheck)}`);
      console.log(`[TEST] Notifications enabled: ${trip.enableMobileNotifications ? 'YES' : 'NO'}`);
      
      // Get the user's display name
      const username = req.user?.displayName || req.user?.username || 'Unknown user';
      
      // Test sending a notification email for route deviation
      let emailSuccess = false;
      
      // Ensure we have a proper debug logging for authentication/email status
      console.log(`[TEST] User authentication status - isAuthenticated: ${req.isAuthenticated()}, has email: ${req.user?.email ? 'YES' : 'NO'}`);
      console.log(`[TEST] Trip enableMobileNotifications value: ${trip.enableMobileNotifications}`);
      
      // Note: the correct condition is that BOTH the user must have an email AND the trip must have notifications enabled
      // Only send email if notifications are enabled for this trip AND we have a valid user email
      if (req.user?.email && trip.enableMobileNotifications) {
        console.log(`[TEST] Route deviation notifications enabled for trip ${tripId} and user has email: ${req.user.email}`);
        emailSuccess = await sendRouteDeviationEmail(
          req.user.email,
          username,
          trip.name || 'Test trip',
          username, // Same user deviating for the test
          routeCheck.distanceFromRoute,
          lat,
          lng
        );
        console.log(`[TEST] Email sending result: ${emailSuccess ? 'SUCCESS' : 'FAILED'}`);
      } else {
        // Explain exactly why we're not sending an email
        if (!req.user?.email) {
          console.log(`[TEST] Not sending notification because user email is missing`);
        }
        if (!trip.enableMobileNotifications) {
          console.log(`[TEST] Not sending notification because enableMobileNotifications is ${trip.enableMobileNotifications} for trip ${tripId}`);
        }
      }
      
      // Create a detailed message about why an email was sent or not
      let resultMessage = '';
      if (emailSuccess) {
        resultMessage = `Test deviation notification sent to ${req.user?.email}`;
      } else if (!trip.enableMobileNotifications) {
        resultMessage = `Notifications are disabled for this trip. Enable them in trip settings.`;
      } else if (!req.user?.email) {
        resultMessage = `No email address available for the current user.`;
      } else {
        resultMessage = `Location checked but email sending failed.`;
      }
      
      res.json({
        success: true,
        message: resultMessage,
        location: { latitude: lat, longitude: lng },
        routeCheck: {
          isOnRoute: routeCheck.isOnRoute,
          distanceFromRoute: routeCheck.distanceFromRoute,
          isDeviation: routeCheck.distanceFromRoute > 5.0
        },
        notificationsEnabled: !!trip.enableMobileNotifications,
        emailSent: emailSuccess
      });
    } catch (error) {
      console.error("Error in test route deviation endpoint:", error);
      
      // Provide more detailed error information based on the type of error
      let errorDetails = error instanceof Error ? error.message : String(error);
      let statusCode = 500;
      let errorType = "Server error";
      
      // Check for specific error types
      if (errorDetails.includes("database") || errorDetails.includes("sql") || errorDetails.includes("connection")) {
        errorType = "Database error";
        statusCode = 503;
      } else if (errorDetails.includes("access") || errorDetails.includes("permission") || errorDetails.includes("unauthorized")) {
        errorType = "Access error";
        statusCode = 403;
      }
      
      res.status(statusCode).json({
        error: errorType,
        details: errorDetails
      });
    }
  });
  
  // Add a configuration endpoint to provide environment variables to the client
  app.get("/api/config", (_req, res) => {
    res.json({
      mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || ''
    });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Check if this is a database connection error
    const isDbConnectionError = 
      err.code === 'ECONNREFUSED' || 
      err.code === 'ETIMEDOUT' || 
      (typeof err.message === 'string' && 
        (err.message.includes('terminating connection') || 
         err.message.includes('connection terminated')));
    
    if (isDbConnectionError) {
      console.error('Database connection error detected:', err);
      // Trigger reconnection attempt in the background
      attemptReconnect(3, 1000).catch(console.error);
      
      return res.status(503).json({
        message: "Database connection temporarily unavailable. Please try again shortly.",
        error: "database_connection_error"
      });
    }

    console.error('Server error:', err);
    res.status(status).json({ message });
    // Don't throw the error - this causes the app to crash
    // throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
