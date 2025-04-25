import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, attemptReconnect, checkDbConnection, cleanupConnections } from "./db";
import { setupAuth, hashPassword } from "./auth";
import { insertGroupSchema, insertTripSchema, insertItineraryItemSchema, insertExpenseSchema, insertMessageSchema, insertGroupMemberSchema, insertVehicleSchema, insertTripVehicleSchema, users as usersTable } from "@shared/schema";
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

  app.put("/api/trips/:id", async (req, res, next) => {
    try {
      console.log(`\n==== PUT /api/trips/:id - EDIT REQUEST STARTED ====`);
      console.log(`Request body:`, JSON.stringify(req.body));
      
      if (!req.isAuthenticated()) {
        console.log("PUT /api/trips/:id - 401 Unauthorized - Not authenticated");
        return res.sendStatus(401);
      }
      
      const tripId = parseInt(req.params.id);
      console.log(`Editing trip ID: ${tripId}`);
      console.log(`User making request: ${req.user?.id} (${typeof req.user?.id}), Username: ${req.user?.username}`);
      
      // Check if the user has access using our helper function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_EDIT] ");
      
      // Only 'owner' level access can edit trips
      if (accessLevel !== 'owner') {
        // If access level is null, the helper function already sent an error response
        if (accessLevel === 'member') {
          console.log(`EDIT DENIED: User is only a member, not the creator of this trip`);
          return res.status(403).json({ 
            message: "You are not authorized to edit this trip. Only the creator can edit trips." 
          });
        }
        return; // Response already sent by checkTripAccess
      }
      
      console.log("Authorization check passed - User is the creator of this trip");
      
      try {
        // Create a modified copy of the input data with properly handled dates
        const processedData = { ...req.body };
        
        console.log("Raw request body with startLocation:", {
          name: req.body.name,
          startLocation: req.body.startLocation,
          destination: req.body.destination
        });
        
        // Convert date strings to Date objects (needed by Drizzle's timestamp column)
        if (req.body.startDate !== undefined) {
          try {
            // Check for special date
            if (typeof req.body.startDate === 'string' && req.body.startDate.includes('2099')) {
              console.log("Converting startDate to special date marker");
              processedData.startDate = new Date('2099-12-31T23:59:59Z');
            } 
            // Check for null or empty string
            else if (req.body.startDate === null || req.body.startDate === '') {
              console.log("Converting empty startDate to special date marker");
              processedData.startDate = new Date('2099-12-31T23:59:59Z');
            }
            // Otherwise, try to parse as Date
            else if (typeof req.body.startDate === 'string') {
              console.log("Converting startDate string to Date object");
              processedData.startDate = new Date(req.body.startDate);
            }
          } catch (err) {
            console.error("Error converting startDate:", err);
            // Fallback to special date
            processedData.startDate = new Date('2099-12-31T23:59:59Z');
          }
        }
        
        if (req.body.endDate !== undefined) {
          try {
            // Check for special date
            if (typeof req.body.endDate === 'string' && req.body.endDate.includes('2099')) {
              console.log("Converting endDate to special date marker");
              processedData.endDate = new Date('2099-12-31T23:59:59Z');
            } 
            // Check for null or empty string
            else if (req.body.endDate === null || req.body.endDate === '') {
              console.log("Converting empty endDate to special date marker");
              processedData.endDate = new Date('2099-12-31T23:59:59Z');
            }
            // Otherwise, try to parse as Date
            else if (typeof req.body.endDate === 'string') {
              console.log("Converting endDate string to Date object");
              processedData.endDate = new Date(req.body.endDate);
            }
          } catch (err) {
            console.error("Error converting endDate:", err);
            // Fallback to special date
            processedData.endDate = new Date('2099-12-31T23:59:59Z');
          }
        }
        
        console.log("Processed data with converted dates:", processedData);
        
        // For debugging
        if (processedData.startDate) {
          console.log("StartDate type:", typeof processedData.startDate);
          console.log("StartDate is Date?", processedData.startDate instanceof Date);
          console.log("StartDate value:", processedData.startDate);
        }
        
        if (processedData.endDate) {
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
          _accessLevel: 'owner' // Since we've confirmed owner access above
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
  });

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
      
      // First verify this user is the trip creator
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        console.log("Trip not found");
        return res.status(404).json({ error: "Trip not found" });
      }
      
      console.log("Trip creator vs user:", { 
        creator: trip.createdBy, 
        user: userId,
        isCreator: trip.createdBy === userId 
      });
      
      if (trip.createdBy !== userId) {
        console.log("User is not trip creator");
        return res.status(403).json({ error: "You must be the trip creator to modify this trip" });
      }
      
      // Deep debug for request data
      console.log("Raw request body:", JSON.stringify(req.body));
      
      // Create a processed version of the data with proper date conversions
      const updateData: Record<string, any> = {
        name: req.body.name,
        startLocation: req.body.startLocation,
        destination: req.body.destination,
        status: req.body.status
      };
      
      // Special date handling - manually convert to Date objects
      if (req.body.startDate !== undefined) {
        try {
          // Use special date for empty/null values or when our special marker is present
          if (!req.body.startDate || 
              (typeof req.body.startDate === 'string' && req.body.startDate.includes('2099'))) {
            updateData.startDate = new Date('2099-12-31T23:59:59Z');
            console.log("Using special marker date for startDate");
          } else {
            // Force proper Date object conversion
            updateData.startDate = new Date(req.body.startDate);
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
            // Force proper Date object conversion
            updateData.endDate = new Date(req.body.endDate);
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
          _accessLevel: 'owner'
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

  // Trip tracking endpoints
  app.post("/api/trips/:id/start", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const tripId = Number(req.params.id);
      
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
      
      return res.status(200).json({ 
        message: "Trip tracking started",
        trip: {
          ...updatedTrip,
          _accessLevel: accessLevel
        }
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
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: "Invalid location data" });
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
      const updatedTrip = await storage.updateTrip(tripId, {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
        distanceTraveled: distance
      });
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to update trip location" });
      }
      
      return res.status(200).json({
        message: "Trip location updated",
        trip: {
          ...updatedTrip,
          _accessLevel: accessLevel
        }
      });
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
      
      // Check if user is the owner or member of trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_COMPLETE] ");
      if (!accessLevel) {
        return; // Error response already sent
      }
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ error: "Only trip owners can complete trips" });
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

  const httpServer = createServer(app);
  return httpServer;
}
