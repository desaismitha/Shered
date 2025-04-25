import { users, groups, groupMembers, trips, itineraryItems, expenses, messages } from "@shared/schema";
import type { User, InsertUser, Group, InsertGroup, GroupMember, InsertGroupMember, Trip, InsertTrip, ItineraryItem, InsertItineraryItem, Expense, InsertExpense, Message, InsertMessage } from "@shared/schema";
import session from "express-session";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool, attemptReconnect, checkDbConnection } from "./db";
import connectPg from "connect-pg-simple";

// Create a custom database error class
class DatabaseConnectionError extends Error {
  constructor(message = "Database connection error") {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Group methods
  createGroup(group: InsertGroup): Promise<Group>;
  getGroup(id: number): Promise<Group | undefined>;
  getGroupsByUserId(userId: number): Promise<Group[]>;
  addUserToGroup(groupMember: InsertGroupMember): Promise<GroupMember>;
  getGroupMembers(groupId: number): Promise<GroupMember[]>;
  
  // Trip methods
  createTrip(trip: InsertTrip): Promise<Trip>;
  getTrip(id: number): Promise<Trip | undefined>;
  updateTrip(id: number, trip: Record<string, any>): Promise<Trip | undefined>;
  getTripsByUserId(userId: number): Promise<Trip[]>;
  getTripsByGroupId(groupId: number): Promise<Trip[]>;
  
  // Itinerary methods
  createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItem>;
  getItineraryItemsByTripId(tripId: number): Promise<ItineraryItem[]>;
  
  // Expense methods
  createExpense(expense: InsertExpense): Promise<Expense>;
  getExpensesByTripId(tripId: number): Promise<Expense[]>;
  getExpensesByUserId(userId: number): Promise<Expense[]>;
  
  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByGroupId(groupId: number): Promise<Message[]>;
  
  // Session store
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // Helper method to execute database operations with error handling
  private async executeDbOperation<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error('Database operation error:', error);
      
      const err = error as Error;
      const isConnectionError = 
        err.message.includes('terminating connection') || 
        err.message.includes('connection terminated') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT');
      
      if (isConnectionError && retries > 0) {
        console.log(`Attempting to reconnect and retry operation (${retries} retries left)...`);
        // Try to reconnect
        const reconnected = await attemptReconnect(1, 500);
        if (reconnected) {
          // If reconnection successful, retry the operation
          return this.executeDbOperation(operation, retries - 1);
        }
      }
      
      // Either not a connection error or reconnection failed
      throw err;
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.executeDbOperation(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    });
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.executeDbOperation(async () => {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return this.executeDbOperation(async () => {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    });
  }
  
  async getAllUsers(): Promise<User[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(users);
    });
  }

  // Group methods
  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    return this.executeDbOperation(async () => {
      const [group] = await db.insert(groups).values(insertGroup).returning();
      
      // Automatically add creator as a member with "admin" role
      await this.addUserToGroup({
        groupId: group.id,
        userId: insertGroup.createdBy,
        role: "admin"
      });
      
      return group;
    });
  }

  async getGroup(id: number): Promise<Group | undefined> {
    return this.executeDbOperation(async () => {
      const [group] = await db.select().from(groups).where(eq(groups.id, id));
      return group;
    });
  }

  async getGroupsByUserId(userId: number): Promise<Group[]> {
    return this.executeDbOperation(async () => {
      // Get group IDs the user is a member of
      const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
      const groupIds = memberships.map(m => m.groupId);
      
      if (groupIds.length === 0) {
        return [];
      }
      
      // Get the groups
      return await db.select().from(groups).where(inArray(groups.id, groupIds));
    });
  }

  async addUserToGroup(insertGroupMember: InsertGroupMember): Promise<GroupMember> {
    return this.executeDbOperation(async () => {
      const [member] = await db.insert(groupMembers).values(insertGroupMember).returning();
      return member;
    });
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
    }, 2); // Try up to 2 retries for this critical method
  }

  // Trip methods
  async createTrip(insertTrip: InsertTrip): Promise<Trip> {
    return this.executeDbOperation(async () => {
      const [trip] = await db.insert(trips).values(insertTrip).returning();
      return trip;
    });
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    return this.executeDbOperation(async () => {
      const [trip] = await db.select().from(trips).where(eq(trips.id, id));
      return trip;
    }, 2); // Try up to 2 retries for this critical method
  }
  
  async updateTrip(id: number, tripData: Record<string, any>): Promise<Trip | undefined> {
    return this.executeDbOperation(async () => {
      try {
        console.log("[STORAGE] Updating trip: ", id, "with data:", JSON.stringify(tripData));
        
        // First check if trip exists
        const existingTrip = await this.getTrip(id);
        if (!existingTrip) {
          console.error(`[STORAGE] Trip with ID ${id} not found`);
          return undefined;
        }
        
        // Extract data we want to update, preserving original values for fields not included
        const updateData: Record<string, any> = {};
        
        // Only include fields that are present in tripData
        if (tripData.name !== undefined) updateData.name = tripData.name;
        if (tripData.destination !== undefined) updateData.destination = tripData.destination;
        if (tripData.description !== undefined) updateData.description = tripData.description;
        if (tripData.imageUrl !== undefined) updateData.imageUrl = tripData.imageUrl;
        if (tripData.status !== undefined) updateData.status = tripData.status;
        if (tripData.groupId !== undefined) updateData.groupId = tripData.groupId;
        
        // Very simple date handling - pass the values directly to the database
        // This avoids any transformation issues
        if (tripData.startDate !== undefined) {
          console.log("[STORAGE] Raw startDate:", tripData.startDate, typeof tripData.startDate);
          
          // If it's a string or Date, use it directly
          // If it's null or empty string, set to null
          if (tripData.startDate === null || tripData.startDate === '') {
            updateData.startDate = null;
            console.log("[STORAGE] Setting startDate to NULL");
          } else {
            updateData.startDate = tripData.startDate;
            console.log("[STORAGE] Using startDate as-is:", updateData.startDate);
          }
        }
        
        if (tripData.endDate !== undefined) {
          console.log("[STORAGE] Raw endDate:", tripData.endDate, typeof tripData.endDate);
          
          // If it's a string or Date, use it directly
          // If it's null or empty string, set to null
          if (tripData.endDate === null || tripData.endDate === '') {
            updateData.endDate = null;
            console.log("[STORAGE] Setting endDate to NULL");
          } else {
            updateData.endDate = tripData.endDate;
            console.log("[STORAGE] Using endDate as-is:", updateData.endDate);
          }
        }
        
        // Never update the creator or creation date
        delete updateData.createdBy;
        delete updateData.createdAt;
        
        console.log("[STORAGE] Final update data:", JSON.stringify(updateData));
        
        // Execute the update
        const [updatedTrip] = await db
          .update(trips)
          .set(updateData)
          .where(eq(trips.id, id))
          .returning();
        
        console.log("[STORAGE] Updated trip result:", JSON.stringify(updatedTrip));
        return updatedTrip;
      } catch (error) {
        console.error("[STORAGE] Error updating trip:", error);
        throw error;
      }
    }, 2);
  }

  async getTripsByUserId(userId: number): Promise<Trip[]> {
    return this.executeDbOperation(async () => {
      // Get all groups the user is a member of
      const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
      const groupIds = memberships.map(m => m.groupId);
      
      if (groupIds.length === 0) {
        return [];
      }
      
      // Get all trips associated with those groups
      return await db.select().from(trips).where(inArray(trips.groupId, groupIds));
    }, 2);
  }

  async getTripsByGroupId(groupId: number): Promise<Trip[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(trips).where(eq(trips.groupId, groupId));
    }, 2);
  }

  // Itinerary methods
  async createItineraryItem(insertItem: InsertItineraryItem): Promise<ItineraryItem> {
    return this.executeDbOperation(async () => {
      const [item] = await db.insert(itineraryItems).values(insertItem).returning();
      return item;
    });
  }

  async getItineraryItemsByTripId(tripId: number): Promise<ItineraryItem[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    });
  }

  // Expense methods
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    return this.executeDbOperation(async () => {
      try {
        console.log("[STORAGE] Creating expense with data:", JSON.stringify(insertExpense));
        
        // Insert directly using the insertExpense data - Drizzle will validate types
        // Make sure splitAmong is properly formatted as an array
        const splitAmong = Array.isArray(insertExpense.splitAmong) 
          ? insertExpense.splitAmong 
          : [];
        
        // Insert with properly typed data
        const [expense] = await db.insert(expenses).values({
          tripId: insertExpense.tripId,
          title: insertExpense.title,
          amount: insertExpense.amount,
          paidBy: insertExpense.paidBy,
          splitAmong: splitAmong,
          date: insertExpense.date || new Date(),
          category: insertExpense.category || null,
        }).returning();
        
        console.log("[STORAGE] Expense created:", JSON.stringify(expense));
        return expense;
      } catch (error) {
        console.error("[STORAGE] Error creating expense:", error);
        throw error;
      }
    });
  }

  async getExpensesByTripId(tripId: number): Promise<Expense[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(expenses).where(eq(expenses.tripId, tripId));
    });
  }

  async getExpensesByUserId(userId: number): Promise<Expense[]> {
    return this.executeDbOperation(async () => {
      // Find expenses where the user paid
      const userExpenses = await db.select().from(expenses).where(eq(expenses.paidBy, userId));
      
      // For PostgreSQL, we need a more specific approach to search in arrays
      // This is a simplified approach that gets all expenses and filters in-memory
      // In a production app, we might want a more efficient SQL query
      const allExpenses = await db.select().from(expenses);
      const splitExpenses = allExpenses.filter(expense => 
        expense.splitAmong.includes(userId) && expense.paidBy !== userId
      );
      
      return [...userExpenses, ...splitExpenses];
    });
  }

  // Message methods
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    return this.executeDbOperation(async () => {
      const [message] = await db.insert(messages).values(insertMessage).returning();
      return message;
    });
  }

  async getMessagesByGroupId(groupId: number): Promise<Message[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(messages)
        .where(eq(messages.groupId, groupId))
        .orderBy(messages.createdAt);
    });
  }
}

export const storage = new DatabaseStorage();
