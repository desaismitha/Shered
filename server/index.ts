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
  // Check for trivial case where route points are the same
  if (startLat === endLat && startLon === endLon) {
    const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
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
  
  // Calculate projection of point onto line
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lenSq;
  
  // Clamp t to line segment
  t = Math.max(0, Math.min(1, t));
  
  // Calculate projection coordinates
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  // Calculate actual distance using haversine formula
  const distanceFromRoute = calculateDistance(
    pointLat,
    pointLon,
    projX,
    projY
  );
  
  return {
    isOnRoute: distanceFromRoute <= toleranceKm,
    distanceFromRoute
  };
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
      
      if (!startCoords || !endCoords) {
        return res.status(400).json({
          error: "Invalid trip locations",
          details: "The trip does not have valid coordinates in its start or end locations"
        });
      }
      
      // Check if the location is on the route
      const routeCheck = isLocationOnRoute(
        lat, lng,
        startCoords.lat, startCoords.lng,
        endCoords.lat, endCoords.lng,
        5.0 // 5km tolerance
      );
      
      // Get the user's display name
      const username = req.user?.displayName || req.user?.username || 'Unknown user';
      
      // Test sending a notification email for route deviation
      let emailSuccess = false;
      
      // Only send email if notifications are enabled for this trip
      if (req.user?.email && trip.enableMobileNotifications) {
        console.log(`[TEST] Route deviation notifications enabled for trip ${tripId}`)
        emailSuccess = await sendRouteDeviationEmail(
          req.user.email,
          username,
          trip.name || 'Test trip',
          username, // Same user deviating for the test
          routeCheck.distanceFromRoute,
          lat,
          lng
        );
      } else {
        console.log(`[TEST] Route deviation notifications ${trip.enableMobileNotifications ? 'enabled' : 'disabled'} for trip ${tripId}`)
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
      res.status(500).json({
        error: "Server error",
        details: error instanceof Error ? error.message : String(error)
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
