import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { checkDbConnection, attemptReconnect } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
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
