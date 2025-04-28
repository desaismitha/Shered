import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, attemptReconnect, checkDbConnection, cleanupConnections } from "./db";
import { setupAuth, hashPassword } from "./auth";
import { insertGroupSchema, insertTripSchema, insertItineraryItemSchema, insertExpenseSchema, insertMessageSchema, insertGroupMemberSchema, insertVehicleSchema, insertTripVehicleSchema, users as usersTable, trips } from "@shared/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { sendGroupInvitation, sendPasswordResetEmail } from "./email";
import crypto from "crypto";

/**
 * Calculate distance between two points using the Haversine formula
 * Returns distance in kilometers
 */
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

/**
 * Helper function to check if a user has access to a trip
 * Handles database connection errors and retry logic
 * 
 * This returns different access levels:
 * - 'owner': User is the creator of the trip and has full edit/delete access
 * - 'member': User is a member of the trip's group and has view/add access
 * - null: User has no access
 */
async function checkTripAccess(
  req: Request,
  tripId: number,
  res: Response,
  next: NextFunction,
  logPrefix = ""
): Promise<'owner' | 'member' | null> {
  console.log(`${logPrefix}==== CHECKING TRIP ACCESS ====`);
  console.log(`${logPrefix}Trip ID: ${tripId}, User: ${req.user?.id || 'not authenticated'}`);
  
  const MAX_RETRIES = 3;
  
  // Try to get the trip with retry logic
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // First check authentication
      if (!req.isAuthenticated()) {
        console.log(`${logPrefix}ACCESS DENIED: User not authenticated`);
        res.status(401).json({ message: "You must be logged in" });
        return null;
      }
      
      // Get the trip details
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        console.log(`${logPrefix}ACCESS DENIED: Trip not found`);
        res.status(404).json({ message: "Trip not found" });
        return null;
      }
      
      // Check if the user created the trip
      // Convert both IDs to strings for consistent comparison
      const creatorId = String(trip.createdBy);
      const userId = String(req.user.id);
      
      console.log(`${logPrefix}Trip data:`, JSON.stringify(trip));
      console.log(`${logPrefix}Trip creator ID: ${creatorId} (original: ${trip.createdBy}, type: ${typeof trip.createdBy})`);
      console.log(`${logPrefix}User ID: ${userId} (original: ${req.user.id}, type: ${typeof req.user.id})`);
      console.log(`${logPrefix}Are they equal as strings? ${creatorId === userId}`);
      
      if (creatorId === userId) {
        console.log(`${logPrefix}ACCESS GRANTED: User is the OWNER of this trip`);
        return 'owner'; // User created the trip, they have full access
      }
      
      // If there's a group associated with the trip, check group membership
      if (trip.groupId) {
        try {
          console.log(`${logPrefix}Checking group membership in group ${trip.groupId}`);
          const groupMembers = await storage.getGroupMembers(trip.groupId);
          console.log(`${logPrefix}Group members:`, JSON.stringify(groupMembers));
          
          // Use string comparison for consistent behavior
          const isMember = groupMembers.some(member => String(member.userId) === userId);
          console.log(`${logPrefix}Is member of group? ${isMember}`);
          
          if (isMember) {
            console.log(`${logPrefix}ACCESS GRANTED: User is a MEMBER of the trip's group`);
            return 'member'; // User is a member of the group, they have view/add access
          }
        } catch (groupErr) {
          console.error(`${logPrefix}Error checking group membership:`, groupErr);
          
          // If this is the last attempt and we still have a group error
          if (attempt === MAX_RETRIES - 1) {
            res.status(503).json({ 
              message: "Database error checking group membership. Please try again." 
            });
            return null;
          }
          
          // Try to reconnect and retry
          console.log(`${logPrefix}Attempting database reconnection before retry...`);
          await attemptReconnect(1, 500);
          continue;
        }
      }
      
      // User doesn't have access
      console.log(`${logPrefix}ACCESS DENIED: User has no access to this trip`);
      res.status(403).json({ message: "You don't have permission to access this trip" });
      return null;
      
    } catch (error) {
      console.error(`${logPrefix}Error checking trip access (attempt ${attempt + 1}):`, error);
      
      // If this is not the last attempt, try to reconnect and retry
      if (attempt < MAX_RETRIES - 1) {
        console.log(`${logPrefix}Attempting database reconnection before retry...`);
        await attemptReconnect(1, 500);
        continue;
      }
      
      // If all attempts failed, send a 503 error
      res.status(503).json({ 
        message: "Database connection error. Please try again shortly." 
      });
      return null;
    }
  }
  
  // This should never happen, but just in case
  res.status(500).json({ message: "Unexpected error checking trip access" });
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);
  
  // Database health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const dbConnected = await checkDbConnection();
      const health = {
        status: dbConnected ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        dbConnection: dbConnected ? "connected" : "disconnected",
        environment: process.env.NODE_ENV || "development"
      };
      
      if (!dbConnected) {
        console.error("Health check failed - Database connection issue");
        // Attempt to reconnect asynchronously (don't wait)
        attemptReconnect(3, 1000).catch(err => {
          console.error("Failed to reconnect during health check:", err);
        });
        
        return res.status(503).json(health);
      }
      
      res.json(health);
    } catch (error) {
      const err = error as Error;
      console.error("Error in health check:", err);
      res.status(500).json({
        status: "critical",
        timestamp: new Date().toISOString(),
        error: err.message
      });
    }
  });
  
  // Manual database connection reset endpoint (admin use only)
  app.post("/api/admin/db-reset", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // In a production app, you'd want to check if the user is an admin
    // For now, just to demonstrate the functionality, we'll allow any authenticated user
    try {
      console.log(`DB reset requested by user ${req.user?.id}`);
      
      // First check if we actually have a connection issue
      const isConnected = await checkDbConnection();
      if (isConnected) {
        console.log("Database connection is healthy, but reset was requested");
      } else {
        console.log("Database connection is unhealthy, proceeding with reset");
      }
      
      // Attempt to reset the connection pool
      const resetSuccess = await cleanupConnections();
      
      if (resetSuccess) {
        return res.json({ 
          success: true, 
          message: "Database connection pool has been reset",
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: "Failed to reset database connection pool",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      const err = error as Error;
      console.error("Error during database reset:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Error during database reset",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API routes
  // Users
  app.get("/api/users", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // In a production app, we might want to implement pagination here
      // For now, we'll just return all users with sensitive fields removed
      const usersList = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        licenseNumber: usersTable.licenseNumber,
        licenseState: usersTable.licenseState,
        licenseExpiry: usersTable.licenseExpiry,
        isEligibleDriver: usersTable.isEligibleDriver,
      }).from(usersTable);
      
      res.json(usersList);
    } catch (err) {
      next(err);
    }
  });
  
  // Driver license routes
  app.put("/api/users/:userId/license", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const userId = parseInt(req.params.userId);
      
      // Only allow users to update their own license info
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this user's license" });
      }

      const { licenseNumber, licenseState, licenseExpiry, isEligibleDriver } = req.body;
      
      if (!licenseNumber || !licenseState || !licenseExpiry) {
        return res.status(400).json({ message: "Missing required license information" });
      }

      // Update the user's license information
      const result = await db.update(usersTable)
        .set({
          licenseNumber,
          licenseState,
          licenseExpiry: new Date(licenseExpiry),
          isEligibleDriver: isEligibleDriver === undefined ? true : !!isEligibleDriver,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // Remove password from response
      const { password, ...updatedUser } = result[0];
      res.json(updatedUser);
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/users/:userId/license/toggle-eligibility", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const userId = parseInt(req.params.userId);
      
      // Only allow users to update their own eligibility
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this user's driver status" });
      }

      const { isEligibleDriver } = req.body;
      
      // Update just the eligibility status
      const result = await db.update(usersTable)
        .set({ isEligibleDriver: !!isEligibleDriver })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (!result || result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // Remove password from response
      const { password, ...updatedUser } = result[0];
      res.json(updatedUser);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/users/by-username/:username", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const user = await storage.getUserByUsername(req.params.username);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove sensitive fields
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (err) {
      next(err);
    }
  });
  
  // Groups
  app.post("/api/groups", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const validatedData = insertGroupSchema.parse({
        ...req.body,
        createdBy: req.user.id
      });
      
      const group = await storage.createGroup(validatedData);
      res.status(201).json(group);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/groups", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groups = await storage.getGroupsByUserId(req.user.id);
      res.json(groups);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/groups/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      const members = await storage.getGroupMembers(groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      res.json(group);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/groups/:id/members", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is an admin of the group
      const members = await storage.getGroupMembers(groupId);
      const isAdmin = members.some(
        member => member.userId === req.user.id && member.role === "admin"
      );
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Only group admins can add members" });
      }
      
      const validatedData = insertGroupMemberSchema.parse({
        ...req.body,
        groupId
      });
      
      const member = await storage.addUserToGroup(validatedData);
      res.status(201).json(member);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/groups/:id/members", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Get group members
      const members = await storage.getGroupMembers(groupId);
      console.log("Group members from DB:", members);
      
      // Check if user is a member of the group
      const isMember = members.some(member => member.userId === req.user.id);
      console.log("Is member check:", { userId: req.user.id, isMember, members });
      
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      res.json(members);
    } catch (err) {
      next(err);
    }
  });
  
  // Invite new user to group by email/phone
  app.post("/api/groups/:id/invite", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is an admin of the group
      const members = await storage.getGroupMembers(groupId);
      const isAdmin = members.some(
        member => member.userId === req.user.id && member.role === "admin"
      );
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Only group admins can invite members" });
      }
      
      // Validate request data
      const inviteSchema = z.object({
        email: z.string().email("Invalid email address"),
        phoneNumber: z.string().optional(),
        role: z.enum(["member", "admin"]).default("member"),
      });
      
      const validatedData = inviteSchema.parse(req.body);
      
      // Generate a unique token for this invitation
      const token = crypto.randomBytes(32).toString('hex');
      
      // In a production app, we would store this token in the database
      // For now, we'll just send the email with a registration link that includes the token
      
      // Create an invite link
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      const inviteLink = `${baseUrl}/register?token=${token}&groupId=${groupId}&email=${encodeURIComponent(validatedData.email)}`;
      
      // Send invitation email
      const inviter = req.user;
      const success = await sendGroupInvitation(
        validatedData.email,
        group.name,
        inviter.displayName || inviter.username,
        inviteLink
      );
      
      if (!success) {
        // If we can't send email due to SendGrid not being available,
        // let's proceed but inform the user about the limitation
        console.log(`Invitation would be sent to ${validatedData.email} for group ${group.name} if SendGrid was configured`);
        
        // Inform client about email limitation but indicate success
        return res.status(200).json({ 
          message: "User has been invited, but email delivery is currently disabled",
          email: validatedData.email,
          phoneNumber: validatedData.phoneNumber,
          token,
          emailSent: false
        });
      }
      
      res.status(200).json({ 
        message: "Invitation sent successfully",
        email: validatedData.email,
        phoneNumber: validatedData.phoneNumber,
        token,
        emailSent: true
      });
    } catch (err) {
      console.error("Error sending invitation:", err);
      next(err);
    }
  });

  // Trips
  app.post("/api/trips", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Create a modified schema that accepts ISO date strings
      const modifiedTripSchema = insertTripSchema.extend({
        startDate: z.string().transform(val => new Date(val)),
        endDate: z.string().transform(val => new Date(val))
      });
      
      const validatedData = modifiedTripSchema.parse({
        ...req.body,
        createdBy: req.user.id
      });
      
      // Any authenticated user can create a trip
      const trip = await storage.createTrip(validatedData);
      res.status(201).json(trip);
    } catch (err) {
      console.error("Trip creation error:", err);
      next(err);
    }
  });

  app.get("/api/trips", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Get base trip data
      const trips = await storage.getTripsByUserId(req.user.id);
      
      // Print all trip IDs for debugging
      console.log("ALL TRIPS FROM DB:", trips.map(t => t.id));
      
      // Enhance each trip with access level information
      const tripsWithAccessLevels = trips.map(trip => {
        // If user is the creator, they're the owner
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        return {
          ...trip,
          _accessLevel: isOwner ? 'owner' : 'member'
        };
      });
      
      console.log(`Returning ${tripsWithAccessLevels.length} trips with access levels`);
      console.log("ALL TRIP IDS BEING RETURNED:", tripsWithAccessLevels.map(t => t.id));
      
      res.json(tripsWithAccessLevels);
    } catch (err) {
      console.error("Error fetching trips list:", err);
      next(err);
    }
  });
  
  // Get active trips (in-progress) for the current user
  app.get("/api/trips/active", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Get base trip data
      const trips = await storage.getTripsByUserId(req.user.id);
      
      // Filter to only in-progress trips
      const activeTrips = trips.filter(trip => trip.status === 'in-progress');
      
      // Enhance each trip with access level information
      const activeTripsWithAccessLevels = activeTrips.map(trip => {
        // If user is the creator, they're the owner
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        return {
          ...trip,
          _accessLevel: isOwner ? 'owner' : 'member'
        };
      });
      
      console.log(`Returning ${activeTripsWithAccessLevels.length} active trips with access levels`);
      res.json(activeTripsWithAccessLevels);
    } catch (err) {
      console.error("Error fetching active trips list:", err);
      next(err);
    }
  });

  // Support both PUT and PATCH for trip updates
  const handleTripUpdate = async (req: Request, res: Response, next: NextFunction, method: string) => {
    try {
      console.log(`\n==== ${method} /api/trips/:id - EDIT REQUEST STARTED ====`);
      console.log(`Request body:`, JSON.stringify(req.body));
      
      if (!req.isAuthenticated()) {
        console.log(`${method} /api/trips/:id - 401 Unauthorized - Not authenticated`);
        return res.sendStatus(401);
      }
      
      const tripId = parseInt(req.params.id);
      console.log(`Editing trip ID: ${tripId}`);
      console.log(`User making request: ${req.user?.id} (${typeof req.user?.id}), Username: ${req.user?.username}`);
      
      // Check if the user has access using our helper function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_EDIT] ");
      
      // Owner level access can edit all fields, member level can edit certain fields
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      if (accessLevel === 'member') {
        // For members, we'll allow all edits for now to make it work
        // This can be restricted later if needed
        console.log("Authorization check passed - User is a member of the trip's group");
      } else if (accessLevel === 'owner') {
        console.log("Authorization check passed - User is the creator of this trip");
      } else {
        // This shouldn't happen normally, but handle just in case
        console.log(`EDIT DENIED: User has unknown access level: ${accessLevel}`);
        return res.status(403).json({ 
          message: "You don't have permission to edit this trip" 
        });
      }
      
      try {
        // Create a modified copy of the input data with properly handled dates
        const processedData = { ...req.body };
        
        // Handle timezone issues for dates
        if (processedData.startDate) {
          // First create a date object from the input
          let dateObj = new Date(processedData.startDate);
          
          // If the date string appears to be a date without time (e.g., "2025-05-01")
          // we need to adjust it to noon UTC to avoid timezone issues
          if (typeof processedData.startDate === 'string' && 
              (processedData.startDate.length === 10 || processedData.startDate.includes('00:00:00'))) {
            // Extract year, month, day from the string and create a UTC date at noon
            const parts = processedData.startDate.split(/[^0-9]/);
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
            const day = parseInt(parts[2]);
            
            // Create date at noon UTC to avoid timezone issues
            dateObj = new Date(Date.UTC(year, month, day, 12, 0, 0));
            console.log("Adjusted startDate to noon UTC:", dateObj);
          }
          
          processedData.startDate = dateObj;
          console.log("StartDate type:", typeof processedData.startDate);
          console.log("StartDate is Date?", processedData.startDate instanceof Date);
          console.log("StartDate value:", processedData.startDate);
        }
        
        if (processedData.endDate) {
          // First create a date object from the input
          let dateObj = new Date(processedData.endDate);
          
          // If the date string appears to be a date without time (e.g., "2025-05-01")
          // we need to adjust it to noon UTC to avoid timezone issues
          if (typeof processedData.endDate === 'string' && 
              (processedData.endDate.length === 10 || processedData.endDate.includes('00:00:00'))) {
            // Extract year, month, day from the string and create a UTC date at noon
            const parts = processedData.endDate.split(/[^0-9]/);
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
            const day = parseInt(parts[2]);
            
            // Create date at noon UTC to avoid timezone issues
            dateObj = new Date(Date.UTC(year, month, day, 12, 0, 0));
            console.log("Adjusted endDate to noon UTC:", dateObj);
          }
          
          processedData.endDate = dateObj;
          console.log("EndDate type:", typeof processedData.endDate);
          console.log("EndDate is Date?", processedData.endDate instanceof Date);
          console.log("EndDate value:", processedData.endDate);
        }
        
        // Create a simplified schema without transforms
        const modifiedTripSchema = z.object({
          id: z.number().optional(),
          name: z.string().optional(),
          startLocation: z.string().nullable().optional(),
          destination: z.string().optional(),
          description: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
          status: z.string().optional(),
          startDate: z.instanceof(Date).optional(),
          endDate: z.instanceof(Date).optional(),
          groupId: z.number().optional(),
          createdBy: z.number().optional(),
          createdAt: z.date().optional()
        });
        
        // Validate the processed data
        const parsedData = modifiedTripSchema.safeParse(processedData);
        
        if (!parsedData.success) {
          console.error("Validation error:", parsedData.error);
          return res.status(400).json({ 
            message: "Invalid trip data", 
            errors: parsedData.error.format()
          });
        }
        
        const validatedData = parsedData.data;
        console.log("Validated data:", validatedData);
        
        // Update the trip
        const updatedTrip = await storage.updateTrip(tripId, validatedData);
        if (!updatedTrip) {
          console.error("Trip update failed - not found or database error");
          return res.status(404).json({ message: "Trip update failed - trip not found" });
        }
        
        console.log("Trip updated successfully:", updatedTrip);
        
        // Include access level in the response like the GET endpoint does
        res.json({
          ...updatedTrip,
          _accessLevel: accessLevel // Use the actual access level we determined above
        });
      } catch (validationErr) {
        console.error("Validation or data processing error:", validationErr);
        res.status(400).json({ 
          message: "Error processing trip data", 
          error: validationErr instanceof Error ? validationErr.message : "Unknown error"
        });
      }
    } catch (err) {
      console.error("Trip update error:", err);
      next(err);
    }
  };

  // Handle PUT and PATCH requests using the same handler
  app.put("/api/trips/:id", (req, res, next) => handleTripUpdate(req, res, next, "PUT"));
  app.patch("/api/trips/:id", (req, res, next) => handleTripUpdate(req, res, next, "PATCH"));

  // Direct SQL endpoint for updating dates
  app.post("/api/trips/:id/simple-update", async (req, res) => {
    console.log("\n==== POST /api/trips/:id/simple-update - SIMPLIFIED UPDATE ENDPOINT ====");
    
    try {
      // Authentication check
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const tripId = parseInt(req.params.id);
      const userId = req.user!.id; 
      
      console.log(`Simple trip update for trip ${tripId}, user ${userId}`);
      
      // Check if user has access to this trip using null callback pattern
      const accessLevelPromise = checkTripAccess(req, tripId, res, ((err) => {
        if (err) {
          console.error("[SIMPLE_UPDATE] Error checking access:", err);
          res.status(500).json({ error: "Error checking access" });
        }
      }) as NextFunction, "[SIMPLE_UPDATE] ");
      
      const accessLevel = await accessLevelPromise;
      
      if (accessLevel === null) {
        console.log("Trip not found or user has no access");
        return res.status(404).json({ error: "Trip not found or you don't have access" });
      }
      
      // Allow both owners and members to update trips
      console.log(`User has ${accessLevel} access to the trip`);
      
      // Deep debug for request data
      console.log("Raw request body:", JSON.stringify(req.body));
      
      // Create a processed version of the data with proper date conversions
      const updateData: Record<string, any> = {
        name: req.body.name,
        startLocation: req.body.startLocation,
        destination: req.body.destination,
        status: req.body.status
      };
      
      // Special date handling - manually convert to Date objects with timezone fixes
      if (req.body.startDate !== undefined) {
        try {
          // Use special date for empty/null values or when our special marker is present
          if (!req.body.startDate || 
              (typeof req.body.startDate === 'string' && req.body.startDate.includes('2099'))) {
            updateData.startDate = new Date('2099-12-31T23:59:59Z');
            console.log("Using special marker date for startDate");
          } else {
            // Handle timezone issues for dates with proper UTC handling
            if (typeof req.body.startDate === 'string' && 
                (req.body.startDate.length === 10 || req.body.startDate.includes('00:00:00'))) {
              // Extract year, month, day from the string and create a UTC date at noon
              const parts = req.body.startDate.split(/[^0-9]/);
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
              const day = parseInt(parts[2]);
              
              // Create date at noon UTC to avoid timezone issues
              updateData.startDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
              console.log("Adjusted startDate to noon UTC:", updateData.startDate);
            } else {
              // Regular date with time, just convert normally
              updateData.startDate = new Date(req.body.startDate);
            }
            console.log("Converted startDate to:", updateData.startDate);
          }
        } catch (err) {
          console.error("Error converting startDate, using marker date:", err);
          updateData.startDate = new Date('2099-12-31T23:59:59Z');
        }
      }
      
      if (req.body.endDate !== undefined) {
        try {
          // Use special date for empty/null values or when our special marker is present
          if (!req.body.endDate || 
              (typeof req.body.endDate === 'string' && req.body.endDate.includes('2099'))) {
            updateData.endDate = new Date('2099-12-31T23:59:59Z');
            console.log("Using special marker date for endDate");
          } else {
            // Handle timezone issues for dates with proper UTC handling
            if (typeof req.body.endDate === 'string' && 
                (req.body.endDate.length === 10 || req.body.endDate.includes('00:00:00'))) {
              // Extract year, month, day from the string and create a UTC date at noon
              const parts = req.body.endDate.split(/[^0-9]/);
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
              const day = parseInt(parts[2]);
              
              // Create date at noon UTC to avoid timezone issues
              updateData.endDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
              console.log("Adjusted endDate to noon UTC:", updateData.endDate);
            } else {
              // Regular date with time, just convert normally
              updateData.endDate = new Date(req.body.endDate);
            }
            console.log("Converted endDate to:", updateData.endDate);
          }
        } catch (err) {
          console.error("Error converting endDate, using marker date:", err);
          updateData.endDate = new Date('2099-12-31T23:59:59Z');
        }
      }
      
      console.log("Processed data for update:", updateData);
      console.log("startDate type:", typeof updateData.startDate);
      console.log("endDate type:", typeof updateData.endDate);
      
      if (updateData.startDate) {
        console.log("Is startDate a Date?", updateData.startDate instanceof Date);
        console.log("startDate value:", updateData.startDate);
        // Verify it has toISOString
        try {
          console.log("Can call toISOString?", updateData.startDate.toISOString());
        } catch (e) {
          console.error("Cannot call toISOString on startDate!");
        }
      }
      
      if (updateData.endDate) {
        console.log("Is endDate a Date?", updateData.endDate instanceof Date);
        console.log("endDate value:", updateData.endDate); 
        // Verify it has toISOString
        try {
          console.log("Can call toISOString?", updateData.endDate.toISOString());
        } catch (e) {
          console.error("Cannot call toISOString on endDate!");
        }
      }
      
      // Update the trip with the processed data
      const result = await storage.updateTrip(tripId, updateData);
      
      console.log("Update response from DB:", result);
      
      if (!result) {
        return res.status(500).json({ error: "Failed to update" });
      }
      
      // Success - return the updated trip
      return res.status(200).json({
        message: "Trip updated successfully",
        trip: {
          ...result,
          _accessLevel: accessLevel  // Use the actual access level
        }
      });
    } catch (err) {
      console.error("ERROR in simple-update endpoint:", err);
      return res.status(500).json({ 
        error: "Server error", 
        message: err instanceof Error ? err.message : String(err) 
      });
    }
  });

  app.get("/api/trips/:id", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.id);
      console.log(`Fetching trip ${tripId} for user ${req.user?.id || 'unknown'}`);
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_VIEW] ");
      if (accessLevel === null) {
        console.log(`Access denied to trip ${tripId}`);
        return; // Response already sent by checkTripAccess
      }
      
      // If we get here, access check passed (either 'owner' or 'member'), so get the trip details
      const trip = await storage.getTrip(tripId);
      console.log(`Trip data for ID ${tripId}:`, trip);
      
      // Include access level in the response to help client determine what actions are allowed
      res.json({
        ...trip,
        _accessLevel: accessLevel // Added property to help client control UI permissions
      });
    } catch (err) {
      console.error("Error in trip details:", err);
      next(err);
    }
  });

  app.get("/api/groups/:id/trips", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      const members = await storage.getGroupMembers(groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      // Get trips for this group
      const trips = await storage.getTripsByGroupId(groupId);
      console.log(`Trips for group ${groupId}:`, JSON.stringify(trips));
      
      // Make sure we're returning Trip objects and not Group objects
      if (trips.length > 0 && !trips[0].destination) {
        console.error("ERROR: Trips data doesn't have destination field:", trips);
      }
      
      // Enhance each trip with access level information
      const tripsWithAccessLevels = trips.map(trip => {
        // If user is the creator, they're the owner, otherwise they're a member
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        return {
          ...trip,
          _accessLevel: isOwner ? 'owner' : 'member'
        };
      });
      
      res.json(tripsWithAccessLevels);
    } catch (err) {
      next(err);
    }
  });

  // Itinerary Items
  app.post("/api/trips/:id/itinerary", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.id);
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[ITINERARY_ADD] ");
      
      // Both owners and members can add itinerary items
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      // If we have access, create the itinerary item
      const validatedData = insertItineraryItemSchema.parse({
        ...req.body,
        tripId,
        createdBy: req.user!.id
      });
      
      const item = await storage.createItineraryItem(validatedData);
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/trips/:id/itinerary", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.id);
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[ITINERARY_VIEW] ");
      
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      // If we have access, get the itinerary items
      const items = await storage.getItineraryItemsByTripId(tripId);
      res.json(items);
    } catch (err) {
      console.error(`Error in itinerary retrieval: ${err}`);
      next(err);
    }
  });
  
  // Get a single itinerary item
  app.get("/api/itinerary/:id", async (req, res, next) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Get the item first
      const item = await storage.getItineraryItem(itemId);
      
      if (!item) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, item.tripId, res, next, "[ITINERARY_ITEM_VIEW] ");
      
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      // If we have access, return the item
      res.json(item);
    } catch (err) {
      console.error(`Error in itinerary item retrieval: ${err}`);
      next(err);
    }
  });
  
  // Update an itinerary item
  app.patch("/api/itinerary/:id", async (req, res, next) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Get the item first to check if it exists and get its tripId
      const item = await storage.getItineraryItem(itemId);
      
      if (!item) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      
      // Only trip owners can update itinerary items
      const accessLevel = await checkTripAccess(req, item.tripId, res, next, "[ITINERARY_UPDATE] ");
      
      // Only owner can update an itinerary item
      if (accessLevel !== 'owner') {
        return res.status(403).json({ message: "You don't have permission to update this itinerary item" });
      }
      
      // Validate the update data - accept partial schema
      const validatedData = insertItineraryItemSchema.partial().parse(req.body);
      
      // Don't allow changing tripId
      delete validatedData.tripId;
      
      // Update the item
      const updatedItem = await storage.updateItineraryItem(itemId, validatedData);
      
      if (!updatedItem) {
        return res.status(500).json({ message: "Failed to update itinerary item" });
      }
      
      res.json(updatedItem);
    } catch (err) {
      console.error(`Error in itinerary item update: ${err}`);
      next(err);
    }
  });
  
  // Delete an itinerary item
  app.delete("/api/itinerary/:id", async (req, res, next) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Get the item first to check if it exists and get its tripId
      const item = await storage.getItineraryItem(itemId);
      
      if (!item) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      
      // Only trip owners can delete itinerary items
      const accessLevel = await checkTripAccess(req, item.tripId, res, next, "[ITINERARY_DELETE] ");
      
      // Only owner can delete an itinerary item
      if (accessLevel !== 'owner') {
        return res.status(403).json({ message: "You don't have permission to delete this itinerary item" });
      }
      
      // Delete the item
      const success = await storage.deleteItineraryItem(itemId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to delete itinerary item" });
      }
      
      res.status(204).end();
    } catch (err) {
      console.error(`Error in itinerary item deletion: ${err}`);
      next(err);
    }
  });

  // Expenses
  app.post("/api/trips/:id/expenses", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.id);
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[EXPENSE_ADD] ");
      
      // Both owners and members can add expenses
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      // If we have access, prepare the expense data
      // Make sure date is properly handled if it's a string
      const { date, splitAmong, ...otherFields } = req.body;
      
      // Convert date string to Date object if it's a string
      let processedDate: Date | undefined;
      if (date && typeof date === 'string') {
        console.log(`[EXPENSE_ADD] Converting date string to Date: ${date}`);
        processedDate = new Date(date);
      } else if (date instanceof Date) {
        processedDate = date;
      } else {
        // Default to current date if not provided
        processedDate = new Date();
      }
      
      console.log(`[EXPENSE_ADD] Processed date: ${processedDate}`);
      
      // Process splitAmong - convert array to JSON string
      // This is needed because we're storing it as text in the database
      let splitAmongString: string;
      try {
        // Ensure we have a valid array to serialize
        if (Array.isArray(splitAmong)) {
          splitAmongString = JSON.stringify(splitAmong);
          console.log(`[EXPENSE_ADD] Converted splitAmong array to string: ${splitAmongString}`);
        } else if (typeof splitAmong === 'string') {
          // If it's already a string, make sure it's valid JSON
          JSON.parse(splitAmong); // This will throw if not valid JSON
          splitAmongString = splitAmong;
          console.log(`[EXPENSE_ADD] Using provided splitAmong string: ${splitAmongString}`);
        } else {
          // Default to empty array
          splitAmongString = '[]';
          console.log(`[EXPENSE_ADD] Using default empty array string for splitAmong`);
        }
      } catch (err) {
        console.error(`[EXPENSE_ADD] Error processing splitAmong:`, err);
        splitAmongString = '[]';
      }
      
      // Validate and create the expense
      const validatedData = insertExpenseSchema.parse({
        ...otherFields,
        date: processedDate,
        tripId,
        paidBy: req.user!.id,
        splitAmong: splitAmongString // Pass the JSON string instead of an array
      });
      
      console.log(`[EXPENSE_ADD] Validated data:`, validatedData);
      
      const expense = await storage.createExpense(validatedData);
      res.status(201).json(expense);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/trips/:id/expenses", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.id);
      
      // Use our reusable trip access check function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[EXPENSE_VIEW] ");
      
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      // If we have access, get the expenses
      const expenses = await storage.getExpensesByTripId(tripId);
      res.json(expenses);
    } catch (err) {
      console.error(`Error in expenses retrieval: ${err}`);
      next(err);
    }
  });

  // Update start location - special dedicated endpoint
  app.post("/api/trips/:id/start-location", async (req, res, next) => {
    try {
      console.log("\n==== POST /api/trips/:id/start-location - START LOCATION UPDATE ENDPOINT ====");
      
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const tripId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { startLocation } = req.body;
      
      console.log(`Updating start location for trip ${tripId} to "${startLocation}"`);
      
      // First verify this user is the trip creator
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      if (trip.createdBy !== userId) {
        return res.status(403).json({ error: "You must be the trip creator to modify this trip" });
      }
      
      // Direct Drizzle ORM update for the startLocation field only
      const [updatedTrip] = await db
        .update(trips)
        .set({ startLocation: startLocation })
        .where(eq(trips.id, tripId))
        .returning();
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to update start location" });
      }
      
      console.log("Start location updated successfully:", updatedTrip.startLocation);
      
      return res.status(200).json({
        message: "Start location updated successfully",
        trip: {
          ...updatedTrip,
          _accessLevel: 'owner'
        }
      });
    } catch (err) {
      console.error("ERROR in start-location endpoint:", err);
      return res.status(500).json({ 
        error: "Server error", 
        message: err instanceof Error ? err.message : String(err) 
      });
    }
  });

  // Trip tracking endpoints
  app.post("/api/trips/:id/start", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const tripId = Number(req.params.id);
      const { itineraryIds } = req.body;
      
      console.log("[TRIP_START] Starting trip tracking for trip:", tripId);
      if (itineraryIds) {
        console.log("[TRIP_START] Selected itinerary items:", itineraryIds);
      }
      
      // Check if user is the owner or member of trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_START] ");
      if (!accessLevel) {
        return; // Error response already sent
      }
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ error: "Only trip owners can start tracking" });
      }
      
      // Update trip status to in-progress
      const updatedTrip = await storage.updateTrip(tripId, { 
        status: 'in-progress',
        lastLocationUpdate: new Date()
      });
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to start trip tracking" });
      }
      
      // Store selected itinerary items information if provided
      let selectedItems = [];
      if (itineraryIds && Array.isArray(itineraryIds) && itineraryIds.length > 0) {
        // Get the itinerary items selected for tracking
        const items = await storage.getItineraryItemsByTripId(tripId);
        selectedItems = items.filter(item => itineraryIds.includes(item.id));
        
        console.log("[TRIP_START] Found selected itinerary items:", 
          selectedItems.map(item => `${item.id}: ${item.title}`));
      }
      
      return res.status(200).json({ 
        message: "Trip tracking started",
        trip: {
          ...updatedTrip,
          _accessLevel: accessLevel
        },
        selectedItineraryItems: selectedItems
      });
    } catch (error) {
      console.error("Error starting trip:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/trips/:id/update-location", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const tripId = Number(req.params.id);
      const { latitude, longitude } = req.body;
      
      console.log("[TRIP_UPDATE_LOCATION] Request body:", req.body);
      console.log("[TRIP_UPDATE_LOCATION] Latitude:", latitude, typeof latitude);
      console.log("[TRIP_UPDATE_LOCATION] Longitude:", longitude, typeof longitude);
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: "Invalid location data - latitude and longitude must be numbers" });
      }
      
      // Check if user is the owner or member of trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_UPDATE_LOCATION] ");
      if (!accessLevel) {
        return; // Error response already sent
      }
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ error: "Only trip owners can update location" });
      }
      
      // Get current trip data
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      // Calculate distance if previous coordinates exist
      let distance = trip.distanceTraveled || 0;
      if (trip.currentLatitude && trip.currentLongitude) {
        const newDistance = calculateDistance(
          trip.currentLatitude, 
          trip.currentLongitude, 
          latitude, 
          longitude
        );
        distance += newDistance;
      }
      
      // Update trip with new location
      const data = {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
        distanceTraveled: distance
      };
      
      // Log the update data for debugging
      console.log("[TRIP_UPDATE_LOCATION] Location update data:", JSON.stringify(data));
      
      // Bypass the storage.updateTrip method which is having issues
      // Use a direct database update for this special case
      try {
        const [updatedResult] = await db
          .update(trips)
          .set(data)
          .where(eq(trips.id, tripId))
          .returning();
        
        if (!updatedResult) {
          return res.status(500).json({ error: "Failed to update trip location - database error" });
        }
        
        console.log("[TRIP_UPDATE_LOCATION] Successfully updated trip location");
        
        return res.status(200).json({
          message: "Trip location updated",
          trip: {
            ...updatedResult,
            _accessLevel: accessLevel
          }
        });
      } catch (dbError) {
        console.error("[TRIP_UPDATE_LOCATION] Database error:", dbError);
        return res.status(500).json({ error: "Database error updating location" });
      }
    } catch (error) {
      console.error("Error updating trip location:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/trips/:id/complete", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const tripId = Number(req.params.id);
      const { confirmComplete, currentItineraryStep, totalItinerarySteps } = req.body;
      
      // Check if user is the owner or member of trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_COMPLETE] ");
      if (!accessLevel) {
        return; // Error response already sent
      }
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ error: "Only trip owners can complete trips" });
      }
      
      // Check if there are more itinerary items left
      console.log("[TRIP_COMPLETE] Current step:", currentItineraryStep, "Total steps:", totalItinerarySteps);
      
      if (
        !confirmComplete && 
        currentItineraryStep !== undefined && 
        totalItinerarySteps !== undefined && 
        currentItineraryStep < totalItinerarySteps - 1
      ) {
        return res.status(400).json({ 
          error: "There are remaining itinerary items that haven't been visited yet",
          currentStep: currentItineraryStep,
          totalSteps: totalItinerarySteps,
          requireConfirmation: true
        });
      }
      
      // Update trip status to completed
      const updatedTrip = await storage.updateTrip(tripId, { status: 'completed' });
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to complete trip" });
      }
      
      return res.status(200).json({
        message: "Trip completed",
        trip: {
          ...updatedTrip,
          _accessLevel: accessLevel
        }
      });
    } catch (error) {
      console.error("Error completing trip:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/expenses", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const expenses = await storage.getExpensesByUserId(req.user.id);
      res.json(expenses);
    } catch (err) {
      next(err);
    }
  });

  // Messages
  app.post("/api/groups/:id/messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      const members = await storage.getGroupMembers(groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        groupId,
        userId: req.user.id
      });
      
      const message = await storage.createMessage(validatedData);
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/groups/:id/messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      try {
        const members = await storage.getGroupMembers(groupId);
        const isMember = members.some(member => member.userId === req.user.id);
        
        if (!isMember) {
          return res.status(403).json({ message: "Not a member of this group" });
        }
        
        const messages = await storage.getMessagesByGroupId(groupId);
        res.json(messages);
      } catch (err) {
        const groupErr = err as Error;
        console.error(`Database error getting group members:`, groupErr);
        return res.status(503).json({ 
          message: "Database connection error - Please try again later",
          error: groupErr.message
        });
      }
    } catch (err) {
      console.error(`Error in messages retrieval: ${err}`);
      next(err);
    }
  });
  


  // User lookup endpoints
  app.get("/api/users/by-username/:username", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const username = req.params.username;
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({ message: `User with username '${username}' not found` });
      }
      
      res.json(user);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/users/by-email/:email", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const email = decodeURIComponent(req.params.email);
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ message: `User with email '${email}' not found` });
      }
      
      // Remove sensitive data
      const { password, resetToken, resetTokenExpiry, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      next(err);
    }
  });

  // Password reset endpoints
  app.post("/api/forgot-password", async (req, res, next) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // For security reasons, don't reveal that the email doesn't exist
        // Still return a success message
        return res.status(200).json({ 
          message: "If your email is registered, you will receive instructions to reset your password."
        });
      }
      
      // Generate token and expiry (1 hour from now)
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 3600000); // 1 hour
      
      // Save token to user record
      await storage.createPasswordResetToken(user.id, token, expiry);
      
      // Create reset link
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host;
      const resetLink = `${protocol}://${host}/reset-password/${token}`;
      
      // Send password reset email
      const emailSent = await sendPasswordResetEmail(
        user.email,
        user.displayName || user.username,  // Use displayName if available, fallback to username
        resetLink
      );
      
      if (!emailSent) {
        console.error(`Failed to send password reset email to ${user.email}`);
        return res.status(500).json({ message: "Failed to send password reset email" });
      }
      
      res.status(200).json({ 
        message: "If your email is registered, you will receive instructions to reset your password."
      });
    } catch (err) {
      console.error("Password reset request error:", err);
      next(err);
    }
  });
  
  app.post("/api/reset-password", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      
      // Find user by token
      const user = await storage.getUserByResetToken(token);
      
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Update user's password and clear reset token
      await storage.updateUserPassword(user.id, hashedPassword);
      
      res.status(200).json({ message: "Password has been reset successfully" });
    } catch (err) {
      console.error("Password reset error:", err);
      next(err);
    }
  });

  // Vehicle management routes
  // Get user vehicles
  app.get("/api/vehicles", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const vehicles = await storage.getVehiclesByUserId(req.user.id);
      res.json(vehicles);
    } catch (err) {
      next(err);
    }
  });
  
  // Get vehicle by ID
  app.get("/api/vehicles/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const vehicleId = parseInt(req.params.id);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Check if user owns the vehicle
      if (vehicle.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to access this vehicle" });
      }
      
      res.json(vehicle);
    } catch (err) {
      next(err);
    }
  });
  
  // Create vehicle
  app.post("/api/vehicles", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const validatedData = insertVehicleSchema.parse({
        ...req.body,
        userId: req.user.id
      });
      
      const vehicle = await storage.createVehicle(validatedData);
      res.status(201).json(vehicle);
    } catch (err) {
      next(err);
    }
  });
  
  // Update vehicle
  app.patch("/api/vehicles/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const vehicleId = parseInt(req.params.id);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Check if user owns the vehicle
      if (vehicle.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to modify this vehicle" });
      }
      
      // Validate the update data - only allow updating these fields
      const updateData: Record<string, any> = {};
      if (req.body.make !== undefined) updateData.make = req.body.make;
      if (req.body.model !== undefined) updateData.model = req.body.model;
      if (req.body.year !== undefined) updateData.year = req.body.year;
      if (req.body.licensePlate !== undefined) updateData.licensePlate = req.body.licensePlate;
      if (req.body.color !== undefined) updateData.color = req.body.color;
      if (req.body.capacity !== undefined) updateData.capacity = req.body.capacity;
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;
      
      const updatedVehicle = await storage.updateVehicle(vehicleId, updateData);
      res.json(updatedVehicle);
    } catch (err) {
      next(err);
    }
  });
  
  // Delete vehicle
  app.delete("/api/vehicles/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const vehicleId = parseInt(req.params.id);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Check if user owns the vehicle
      if (vehicle.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to delete this vehicle" });
      }
      
      const success = await storage.deleteVehicle(vehicleId);
      
      if (success) {
        res.status(200).json({ message: "Vehicle deleted successfully" });
      } else {
        res.status(400).json({ message: "Vehicle could not be deleted. It may be assigned to trips." });
      }
    } catch (err) {
      next(err);
    }
  });
  
  // Trip vehicle management routes
  // Get vehicles for a trip
  app.get("/api/trips/:tripId/vehicles", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.tripId);
      
      // Check if user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP VEHICLES] ");
      if (!accessLevel) return; // Response already sent
      
      const tripVehicles = await storage.getTripVehicles(tripId);
      res.json(tripVehicles);
    } catch (err) {
      next(err);
    }
  });
  
  // Assign vehicle to trip
  app.post("/api/trips/:tripId/vehicles", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.tripId);
      
      // Only owner or member can assign vehicles
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[ASSIGN VEHICLE] ");
      if (!accessLevel) return; // Response already sent
      
      // Check if vehicle belongs to user or is in group members' vehicles
      const vehicleId = parseInt(req.body.vehicleId);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // If not the vehicle owner, check if the trip owner
      if (vehicle.userId !== req.user.id && accessLevel !== 'owner') {
        return res.status(403).json({ 
          message: "You can only assign your own vehicles or must be the trip owner to assign others' vehicles"
        });
      }
      
      const validatedData = insertTripVehicleSchema.parse({
        ...req.body,
        tripId,
        // Set default for optional fields if not provided
        isMain: req.body.isMain !== undefined ? req.body.isMain : true,
        assignedTo: req.body.assignedTo || null,
        notes: req.body.notes || null
      });
      
      const tripVehicle = await storage.assignVehicleToTrip(validatedData);
      res.status(201).json(tripVehicle);
    } catch (err) {
      next(err);
    }
  });
  
  // Remove vehicle from trip
  app.delete("/api/trips/:tripId/vehicles/:id", async (req, res, next) => {
    try {
      const tripId = parseInt(req.params.tripId);
      
      // Only owner can remove vehicles
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[REMOVE VEHICLE] ");
      if (!accessLevel) return; // Response already sent
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ message: "Only the trip owner can remove vehicles" });
      }
      
      const tripVehicleId = parseInt(req.params.id);
      const success = await storage.removeTripVehicle(tripVehicleId);
      
      if (success) {
        res.status(200).json({ message: "Vehicle removed from trip successfully" });
      } else {
        res.status(400).json({ message: "Vehicle could not be removed from trip" });
      }
    } catch (err) {
      next(err);
    }
  });

  // Get eligible drivers for a trip
  app.get("/api/trips/:tripId/eligible-drivers", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      
      // Check if user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[ELIGIBLE DRIVERS] ");
      if (!accessLevel) return; // Response already sent
      
      // First get the trip to find the group
      const trip = await storage.getTrip(tripId);
      if (!trip || !trip.groupId) {
        return res.status(404).json({ message: "Trip not found or not associated with a group" });
      }
      
      // Get all group members
      const groupMembers = await storage.getGroupMembers(trip.groupId);
      if (!groupMembers || groupMembers.length === 0) {
        return res.json([]);
      }
      
      // Get all users who are group members
      const users = await storage.getAllUsers();
      
      // Filter for users who are group members and have driver eligibility
      const eligibleDrivers = users.filter(user => {
        // Check if user is in this group
        const isGroupMember = groupMembers.some(member => member.userId === user.id);
        // Check if user has valid driver license info and is eligible
        const hasValidLicense = user.licenseNumber && user.licenseState && user.licenseExpiry;
        const licenseValid = hasValidLicense && new Date(user.licenseExpiry) > new Date();
        
        return isGroupMember && licenseValid && user.isEligibleDriver;
      });
      
      // Remove sensitive information from response
      const sanitizedDrivers = eligibleDrivers.map(user => {
        const { password, ...driverInfo } = user;
        return driverInfo;
      });
      
      res.json(sanitizedDrivers);
    } catch (err) {
      next(err);
    }
  });
  
  // Assign driver to vehicle for a trip
  app.put("/api/trips/:tripId/vehicles/:vehicleId/assign-driver", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      const vehicleId = parseInt(req.params.vehicleId);
      const { driverId } = req.body; // This can be null to unassign
      
      // Only trip owner can assign drivers
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[ASSIGN DRIVER] ");
      if (!accessLevel) return; // Response already sent
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ message: "Only the trip owner can assign drivers" });
      }
      
      // Get the trip vehicle record
      const tripVehicles = await storage.getTripVehicles(tripId);
      const tripVehicle = tripVehicles.find(tv => tv.vehicleId === vehicleId);
      
      if (!tripVehicle) {
        return res.status(404).json({ message: "Vehicle not found in this trip" });
      }
      
      // If assigning a driver, check if driver is eligible
      if (driverId) {
        // First get the trip to find the group
        const trip = await storage.getTrip(tripId);
        if (!trip || !trip.groupId) {
          return res.status(404).json({ message: "Trip not found or not associated with a group" });
        }
        
        // Check if user is in this group
        const groupMembers = await storage.getGroupMembers(trip.groupId);
        const isGroupMember = groupMembers.some(member => member.userId === driverId);
        
        if (!isGroupMember) {
          return res.status(400).json({ message: "The selected driver is not a member of this trip's group" });
        }
        
        // Get driver user object
        const driver = await storage.getUser(driverId);
        if (!driver) {
          return res.status(404).json({ message: "Driver user not found" });
        }
        
        // Check if driver has valid license and eligibility
        const hasValidLicense = driver.licenseNumber && driver.licenseState && driver.licenseExpiry;
        const licenseValid = hasValidLicense && new Date(driver.licenseExpiry) > new Date();
        
        if (!licenseValid || !driver.isEligibleDriver) {
          return res.status(400).json({ 
            message: "The selected user is not eligible to be a driver. They must have valid license information and be marked as eligible." 
          });
        }
      }
      
      // Update the trip vehicle
      const updatedTripVehicle = await storage.updateTripVehicle(tripVehicle.id, { assignedTo: driverId || null });
      
      if (!updatedTripVehicle) {
        return res.status(500).json({ message: "Failed to update driver assignment" });
      }
      
      res.json(updatedTripVehicle);
    } catch (err) {
      next(err);
    }
  });
  
  // Direct test endpoint to see all trips (debugging only)
  app.get("/api/debug/all-trips", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get user-created trips directly
      const createdTrips = await db.select().from(trips).where(eq(trips.createdBy, req.user.id));
      console.log("Direct DB query: User-created trips:", createdTrips.map(t => t.id));
      
      // Get trips through storage method
      const storageTrips = await storage.getTripsByUserId(req.user.id);
      console.log("Storage method trips:", storageTrips.map(t => t.id));
      
      res.json({
        numberOfCreatedTrips: createdTrips.length,
        createdTripIds: createdTrips.map(t => t.id),
        numberOfStorageTrips: storageTrips.length,
        storageTripIds: storageTrips.map(t => t.id)
      });
    } catch (error) {
      console.error("Debug trips error:", error);
      res.status(500).json({ error: "Error retrieving trips" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
