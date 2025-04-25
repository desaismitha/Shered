import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, attemptReconnect, checkDbConnection, cleanupConnections } from "./db";
import { setupAuth } from "./auth";
import { insertGroupSchema, insertTripSchema, insertItineraryItemSchema, insertExpenseSchema, insertMessageSchema, insertGroupMemberSchema, users as usersTable } from "@shared/schema";
import { z } from "zod";
import { sendGroupInvitation } from "./email";
import crypto from "crypto";

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
        createdAt: usersTable.createdAt
      }).from(usersTable);
      
      res.json(usersList);
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
      
      const trips = await storage.getTripsByUserId(req.user.id);
      res.json(trips);
    } catch (err) {
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
      
      // Create a modified schema that accepts date strings
      const modifiedTripSchema = insertTripSchema
        .extend({
          id: z.number(),
          startDate: z.union([
            z.string().transform(val => new Date(val)),
            z.date()
          ]),
          endDate: z.union([
            z.string().transform(val => new Date(val)),
            z.date()
          ])
        })
        .partial()
        .required({ id: true });
      
      // Validate the request data
      const validatedData = modifiedTripSchema.parse(req.body);
      
      // Update the trip
      const updatedTrip = await storage.updateTrip(tripId, validatedData);
      if (!updatedTrip) {
        return res.status(404).json({ message: "Trip update failed" });
      }
      
      res.json(updatedTrip);
    } catch (err) {
      console.error("Trip update error:", err);
      next(err);
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
      
      res.json(trips);
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
      
      // If we have access, create the expense
      const validatedData = insertExpenseSchema.parse({
        ...req.body,
        tripId,
        paidBy: req.user!.id
      });
      
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
      } catch (groupErr) {
        console.error(`Database error getting group members: ${groupErr}`);
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
      // For now we don't have this method, so we'll search all users
      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(user => user.email === email);
      
      if (!user) {
        return res.status(404).json({ message: `User with email '${email}' not found` });
      }
      
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
