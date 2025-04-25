import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth } from "./auth";
import { insertGroupSchema, insertTripSchema, insertItineraryItemSchema, insertExpenseSchema, insertMessageSchema, insertGroupMemberSchema, users as usersTable } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

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

  app.get("/api/trips/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      // If trip belongs to a group, check if user is a member
      if (trip.groupId) {
        const members = await storage.getGroupMembers(trip.groupId);
        const isMember = members.some(member => member.userId === req.user.id);
        
        if (!isMember) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        // If trip doesn't belong to a group, check if user is the creator
        if (trip.createdBy !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      res.json(trip);
    } catch (err) {
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
      
      const trips = await storage.getTripsByGroupId(groupId);
      res.json(trips);
    } catch (err) {
      next(err);
    }
  });

  // Itinerary Items
  app.post("/api/trips/:id/itinerary", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      // Check access permissions
      let hasAccess = false;
      
      if (trip.groupId) {
        // For group trips, check if user is a member
        const members = await storage.getGroupMembers(trip.groupId);
        hasAccess = members.some(member => member.userId === req.user.id);
      } else {
        // For personal trips, check if user is the creator
        hasAccess = trip.createdBy === req.user.id;
      }
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertItineraryItemSchema.parse({
        ...req.body,
        tripId,
        createdBy: req.user.id
      });
      
      const item = await storage.createItineraryItem(validatedData);
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/trips/:id/itinerary", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      // Check if user is a member of the group associated with this trip
      const members = await storage.getGroupMembers(trip.groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const items = await storage.getItineraryItemsByTripId(tripId);
      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  // Expenses
  app.post("/api/trips/:id/expenses", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      // Check if user is a member of the group associated with this trip
      const members = await storage.getGroupMembers(trip.groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertExpenseSchema.parse({
        ...req.body,
        tripId,
        paidBy: req.user.id
      });
      
      const expense = await storage.createExpense(validatedData);
      res.status(201).json(expense);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/trips/:id/expenses", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      // Check if user is a member of the group associated with this trip
      const members = await storage.getGroupMembers(trip.groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const expenses = await storage.getExpensesByTripId(tripId);
      res.json(expenses);
    } catch (err) {
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
      const members = await storage.getGroupMembers(groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      const messages = await storage.getMessagesByGroupId(groupId);
      res.json(messages);
    } catch (err) {
      next(err);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
