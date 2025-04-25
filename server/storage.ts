import { users, groups, groupMembers, trips, itineraryItems, expenses, messages, vehicles, tripVehicles } from "@shared/schema";
import type { User, InsertUser, Group, InsertGroup, GroupMember, InsertGroupMember, Trip, InsertTrip, ItineraryItem, InsertItineraryItem, Expense, InsertExpense, Message, InsertMessage, Vehicle, InsertVehicle, TripVehicle, InsertTripVehicle } from "@shared/schema";
import session from "express-session";
import { eq, ne, and, inArray, gt } from "drizzle-orm";
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
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  createPasswordResetToken(userId: number, token: string, expiry: Date): Promise<boolean>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  updateUserPassword(userId: number, newPassword: string): Promise<boolean>;

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
  
  // Vehicle methods
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  getVehicle(id: number): Promise<Vehicle | undefined>;
  getVehiclesByUserId(userId: number): Promise<Vehicle[]>;
  updateVehicle(id: number, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: number): Promise<boolean>;
  
  // Trip Vehicle methods
  assignVehicleToTrip(tripVehicle: InsertTripVehicle): Promise<TripVehicle>;
  removeTripVehicle(id: number): Promise<boolean>;
  getTripVehicles(tripId: number): Promise<TripVehicle[]>;
  updateTripVehicle(id: number, data: Partial<InsertTripVehicle>): Promise<TripVehicle | undefined>;
  
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
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.executeDbOperation(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    });
  }

  async getAllUsers(): Promise<User[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(users);
    });
  }
  
  async createPasswordResetToken(userId: number, token: string, expiry: Date): Promise<boolean> {
    return this.executeDbOperation(async () => {
      const result = await db
        .update(users)
        .set({ 
          resetToken: token,
          resetTokenExpiry: expiry
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      
      return result.length > 0;
    });
  }
  
  async getUserByResetToken(token: string): Promise<User | undefined> {
    return this.executeDbOperation(async () => {
      // Find user with this token where expiry is in the future
      const now = new Date();
      
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.resetToken, token),
            gt(users.resetTokenExpiry as any, now)
          )
        );
      
      return user;
    });
  }
  
  async updateUserPassword(userId: number, newPassword: string): Promise<boolean> {
    return this.executeDbOperation(async () => {
      const result = await db
        .update(users)
        .set({ 
          password: newPassword,
          resetToken: null,
          resetTokenExpiry: null
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      
      return result.length > 0;
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
        
        // Convert date strings to Date objects
        // Drizzle requires actual Date objects for timestamp fields
        if (tripData.startDate !== undefined) {
          console.log("[STORAGE] Raw startDate:", tripData.startDate, typeof tripData.startDate);
          
          // We need to handle the case where dates should be NULL but our schema has NOT NULL constraints
          // Use 2099-12-31 as a special marker date that we'll handle in the UI
          const DEFAULT_DATE = new Date('2099-12-31T23:59:59Z');
          
          // If it's null or empty string, use our special marker date
          if (tripData.startDate === null || tripData.startDate === '') {
            updateData.startDate = DEFAULT_DATE;
            console.log("[STORAGE] Setting startDate to marker date:", DEFAULT_DATE);
          } 
          // Check if it contains our special marker string
          else if (typeof tripData.startDate === 'string' && tripData.startDate.includes('2099')) {
            updateData.startDate = DEFAULT_DATE;
            console.log("[STORAGE] Special marker date detected, using:", DEFAULT_DATE);
          } 
          else {
            // Convert string to Date object
            try {
              // If it's already a Date object, this is fine
              // If it's a string, convert it to a Date
              updateData.startDate = tripData.startDate instanceof Date 
                ? tripData.startDate 
                : new Date(tripData.startDate);
                
              console.log("[STORAGE] Converted startDate to Date:", updateData.startDate);
            } catch (err) {
              console.error("[STORAGE] Error converting startDate to Date:", err);
              // Use the marker date as fallback
              updateData.startDate = DEFAULT_DATE;
            }
          }
        }
        
        if (tripData.endDate !== undefined) {
          console.log("[STORAGE] Raw endDate:", tripData.endDate, typeof tripData.endDate);
          
          // We need to handle the case where dates should be NULL but our schema has NOT NULL constraints
          // Use 2099-12-31 as a special marker date that we'll handle in the UI
          const DEFAULT_DATE = new Date('2099-12-31T23:59:59Z');
          
          // If it's null or empty string, use our special marker date
          if (tripData.endDate === null || tripData.endDate === '') {
            updateData.endDate = DEFAULT_DATE;
            console.log("[STORAGE] Setting endDate to marker date:", DEFAULT_DATE);
          }
          // Check if it contains our special marker string
          else if (typeof tripData.endDate === 'string' && tripData.endDate.includes('2099')) {
            updateData.endDate = DEFAULT_DATE;
            console.log("[STORAGE] Special marker date detected, using:", DEFAULT_DATE);
          } 
          else {
            // Convert string to Date object
            try {
              // If it's already a Date object, this is fine
              // If it's a string, convert it to a Date
              updateData.endDate = tripData.endDate instanceof Date 
                ? tripData.endDate 
                : new Date(tripData.endDate);
                
              console.log("[STORAGE] Converted endDate to Date:", updateData.endDate);
            } catch (err) {
              console.error("[STORAGE] Error converting endDate to Date:", err);
              // Use the marker date as fallback
              updateData.endDate = DEFAULT_DATE;
            }
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
        
        // We assume that splitAmong is already a JSON string by the time it 
        // reaches this method, as it was processed in the route handler
        // Just log what we received for debugging
        console.log("[STORAGE] Received splitAmong:", insertExpense.splitAmong);
        
        // Insert the data with splitAmong directly (should already be a string)
        const [expense] = await db.insert(expenses).values({
          tripId: insertExpense.tripId,
          title: insertExpense.title,
          amount: insertExpense.amount,
          paidBy: insertExpense.paidBy,
          splitAmong: insertExpense.splitAmong, // Should already be a JSON string
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
      
      // Get all expenses
      const allExpenses = await db.select().from(expenses);
      
      // Process the expenses to find those where the user is in the splitAmong array
      // For JSON column, the data should already be deserialized by Drizzle
      const splitExpenses = allExpenses.filter(expense => {
        try {
          // Safely access splitAmong array
          const splitArray = expense.splitAmong;
          
          // Check if splitAmong is an array and contains the userId
          if (Array.isArray(splitArray)) {
            return splitArray.includes(userId) && expense.paidBy !== userId;
          }
          
          // Handle the case where it might be stored as a string (for compatibility)
          if (typeof splitArray === 'string') {
            try {
              const parsedArray = JSON.parse(splitArray);
              return Array.isArray(parsedArray) && 
                     parsedArray.includes(userId) && 
                     expense.paidBy !== userId;
            } catch (err) {
              console.error('[STORAGE] Error parsing splitAmong JSON string:', err);
              return false;
            }
          }
          
          return false;
        } catch (err) {
          console.error('[STORAGE] Error checking splitAmong:', err);
          return false;
        }
      });
      
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
  
  // Vehicle methods
  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Creating vehicle with data:", JSON.stringify(insertVehicle));
      const [vehicle] = await db.insert(vehicles).values(insertVehicle).returning();
      console.log("[STORAGE] Vehicle created:", JSON.stringify(vehicle));
      return vehicle;
    });
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    return this.executeDbOperation(async () => {
      const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
      return vehicle;
    });
  }

  async getVehiclesByUserId(userId: number): Promise<Vehicle[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(vehicles).where(eq(vehicles.userId, userId));
    });
  }

  async updateVehicle(id: number, vehicleData: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    return this.executeDbOperation(async () => {
      const [vehicle] = await db.update(vehicles)
        .set(vehicleData)
        .where(eq(vehicles.id, id))
        .returning();
      return vehicle;
    });
  }

  async deleteVehicle(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      // First check if vehicle is assigned to any trips
      const tripVehicleLinks = await db.select()
        .from(tripVehicles)
        .where(eq(tripVehicles.vehicleId, id));
      
      // If it's used in trips, we won't delete it
      if (tripVehicleLinks.length > 0) {
        console.log(`[STORAGE] Vehicle with ID ${id} is used in ${tripVehicleLinks.length} trips and cannot be deleted`);
        return false;
      }
      
      // Delete the vehicle
      const result = await db.delete(vehicles)
        .where(eq(vehicles.id, id))
        .returning({ id: vehicles.id });
      
      return result.length > 0;
    });
  }
  
  // Trip Vehicle methods
  async assignVehicleToTrip(insertTripVehicle: InsertTripVehicle): Promise<TripVehicle> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Assigning vehicle to trip:", JSON.stringify(insertTripVehicle));
      
      // If this is the main vehicle, set all other vehicles for this trip to non-main
      if (insertTripVehicle.isMain) {
        await db.update(tripVehicles)
          .set({ isMain: false })
          .where(eq(tripVehicles.tripId, insertTripVehicle.tripId));
      }
      
      const [tripVehicle] = await db.insert(tripVehicles)
        .values(insertTripVehicle)
        .returning();
      
      console.log("[STORAGE] Vehicle assigned to trip:", JSON.stringify(tripVehicle));
      return tripVehicle;
    });
  }
  
  async removeTripVehicle(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      const result = await db.delete(tripVehicles)
        .where(eq(tripVehicles.id, id))
        .returning({ id: tripVehicles.id });
      
      return result.length > 0;
    });
  }
  
  async getTripVehicles(tripId: number): Promise<TripVehicle[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(tripVehicles)
        .where(eq(tripVehicles.tripId, tripId));
    });
  }
  
  async updateTripVehicle(id: number, data: Partial<InsertTripVehicle>): Promise<TripVehicle | undefined> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Updating trip vehicle:", id, "with data:", JSON.stringify(data));
      
      // First check if trip vehicle exists
      const tripVehicleList = await db.select().from(tripVehicles).where(eq(tripVehicles.id, id));
      if (!tripVehicleList.length) {
        console.error(`[STORAGE] Trip vehicle with ID ${id} not found`);
        return undefined;
      }
      
      // Make a copy of data to avoid modifying the original
      const updateData = { ...data };
      
      // Never update these fields
      delete updateData.tripId;
      delete updateData.vehicleId;
      
      // If setting this as main, unset other vehicles as main
      if (updateData.isMain) {
        const tripId = tripVehicleList[0].tripId;
        await db.update(tripVehicles)
          .set({ isMain: false })
          .where(
            and(
              eq(tripVehicles.tripId, tripId),
              ne(tripVehicles.id, id)
            )
          );
      }
      
      // Execute the update
      const [updatedTripVehicle] = await db
        .update(tripVehicles)
        .set(updateData)
        .where(eq(tripVehicles.id, id))
        .returning();
      
      console.log("[STORAGE] Updated trip vehicle result:", JSON.stringify(updatedTripVehicle));
      return updatedTripVehicle;
    });
  }
}

export const storage = new DatabaseStorage();
