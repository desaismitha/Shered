import { users, groups, groupMembers, trips, itineraryItems, expenses, messages, vehicles, tripVehicles, tripCheckIns, children, tripModificationRequests, tripDriverAssignments, savedLocations } from "@shared/schema";
import type { User, InsertUser, Group, InsertGroup, GroupMember, InsertGroupMember, Trip, InsertTrip, ItineraryItem, InsertItineraryItem, Expense, InsertExpense, Message, InsertMessage, Vehicle, InsertVehicle, TripVehicle, InsertTripVehicle, TripCheckIn, InsertTripCheckIn, Child, InsertChild, TripModificationRequest, InsertTripModificationRequest, TripDriverAssignment, InsertTripDriverAssignment, SavedLocation, InsertSavedLocation } from "@shared/schema";
import session from "express-session";
import { eq, ne, and, inArray, gt, desc } from "drizzle-orm";
import { db, pool, attemptReconnect, checkDbConnection } from "./db";
import connectPg from "connect-pg-simple";
import { comparePasswords } from "./auth";

// Create a custom database error class
class DatabaseConnectionError extends Error {
  constructor(message = "Database connection error") {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Saved Locations methods
  getSavedLocations(userId: number, limit?: number): Promise<SavedLocation[]>;
  getSavedLocation(id: number): Promise<SavedLocation | undefined>;
  createSavedLocation(location: InsertSavedLocation): Promise<SavedLocation>;
  updateSavedLocation(id: number, data: Partial<InsertSavedLocation>): Promise<SavedLocation | undefined>;
  incrementLocationVisitCount(id: number): Promise<SavedLocation | undefined>;
  deleteSavedLocation(id: number): Promise<boolean>;
  
  // Driver Assignment methods
  createDriverAssignment(assignment: InsertTripDriverAssignment): Promise<TripDriverAssignment>;
  getDriverAssignments(tripId: number): Promise<TripDriverAssignment[]>;
  getDriverAssignment(id: number): Promise<TripDriverAssignment | undefined>;
  updateDriverAssignment(id: number, data: Partial<InsertTripDriverAssignment>): Promise<TripDriverAssignment | undefined>;
  deleteDriverAssignment(id: number): Promise<boolean>;
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getEligibleDrivers(): Promise<User[]>;
  createPasswordResetToken(userId: number, token: string, expiry: Date): Promise<boolean>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  updateUserPassword(userId: number, newPassword: string): Promise<boolean>;
  updateUserVerification(userId: number, data: { 
    emailVerified?: boolean;
    verificationToken?: string | null;
    verificationTokenExpiry?: Date | null;
    otpToken?: string | null; 
    otpTokenExpiry?: Date | null;
  }): Promise<boolean>;
  verifyUserEmail(token: string): Promise<boolean>;
  verifyUserOtp(userId: number, otp: string): Promise<boolean>;
  updateUserDrivingDetails(userId: number, details: {
    licenseNumber: string | null;
    licenseState: string | null;
    licenseExpiry: Date | null;
    isEligibleDriver: boolean;
  }): Promise<User | undefined>;

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
  
  // Check-in methods
  createTripCheckIn(checkIn: InsertTripCheckIn): Promise<TripCheckIn>;
  getTripCheckIns(tripId: number): Promise<TripCheckIn[]>;
  getUserTripCheckIn(tripId: number, userId: number): Promise<TripCheckIn | undefined>;
  updateTripCheckIn(id: number, data: Partial<InsertTripCheckIn>): Promise<TripCheckIn | undefined>;
  deleteTripCheckIn(id: number): Promise<boolean>;
  getAllTripCheckInStatus(tripId: number): Promise<{ userId: number; status: string }[]>;
  
  // Child profile methods
  createChild(child: InsertChild): Promise<Child>;
  getChildById(id: number): Promise<Child | undefined>;
  getChildrenByUserId(userId: number): Promise<Child[]>;
  updateChild(id: number, child: Partial<InsertChild>): Promise<Child | undefined>;
  deleteChild(id: number): Promise<boolean>;
  
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
  
  async updateUserVerification(userId: number, data: {
    emailVerified?: boolean;
    verificationToken?: string | null;
    verificationTokenExpiry?: Date | null;
    otpToken?: string | null;
    otpTokenExpiry?: Date | null;
  }): Promise<boolean> {
    return this.executeDbOperation(async () => {
      const result = await db
        .update(users)
        .set(data)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      
      return result.length > 0;
    });
  }
  
  async verifyUserEmail(token: string): Promise<boolean> {
    return this.executeDbOperation(async () => {
      // First, find the user with this verification token where expiry is in the future
      const now = new Date();
      
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.verificationToken, token),
            gt(users.verificationTokenExpiry as any, now)
          )
        );
      
      if (!user) {
        return false;
      }
      
      // Update the user to mark email as verified and clear the token
      const result = await db
        .update(users)
        .set({
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null
        })
        .where(eq(users.id, user.id))
        .returning({ id: users.id });
      
      return result.length > 0;
    });
  }
  
  async verifyUserOtp(userId: number, otp: string): Promise<boolean> {
    return this.executeDbOperation(async () => {
      // Get the user
      const user = await this.getUser(userId);
      if (!user || !user.otpToken || !user.otpTokenExpiry) {
        return false;
      }
      
      // Check if the OTP is expired
      const now = new Date();
      if (new Date(user.otpTokenExpiry) < now) {
        return false;
      }
      
      // Check if the provided OTP matches the stored one
      const isValidOtp = await comparePasswords(otp, user.otpToken);
      if (!isValidOtp) {
        return false;
      }
      
      // Clear the OTP after successful verification
      const result = await db
        .update(users)
        .set({
          otpToken: null,
          otpTokenExpiry: null
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      
      return result.length > 0;
    });
  }
  
  async updateUserDrivingDetails(userId: number, details: {
    licenseNumber: string | null;
    licenseState: string | null;
    licenseExpiry: Date | null;
    isEligibleDriver: boolean;
  }): Promise<User | undefined> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Updating driving details for user:", userId);
      
      // Update the user with driving details
      const [updatedUser] = await db
        .update(users)
        .set({
          licenseNumber: details.licenseNumber,
          licenseState: details.licenseState,
          licenseExpiry: details.licenseExpiry,
          isEligibleDriver: details.isEligibleDriver
        })
        .where(eq(users.id, userId))
        .returning();
      
      return updatedUser;
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
      console.log(`[STORAGE] Getting groups for user ID: ${userId}`);
      
      // Get group IDs the user is a member of
      const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
      console.log(`[STORAGE] Found ${memberships.length} group memberships for user ${userId}:`, memberships);
      
      const groupIds = memberships.map(m => m.groupId);
      console.log(`[STORAGE] Extracted group IDs: ${groupIds.join(', ')}`);
      
      if (groupIds.length === 0) {
        console.log(`[STORAGE] No group memberships found for user ${userId}`);
        return [];
      }
      
      // Get the groups
      const foundGroups = await db.select().from(groups).where(inArray(groups.id, groupIds));
      console.log(`[STORAGE] Retrieved ${foundGroups.length} groups:`, foundGroups);
      
      return foundGroups;
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
        if (tripData.startLocation !== undefined) updateData.startLocation = tripData.startLocation;
        if (tripData.destination !== undefined) updateData.destination = tripData.destination;
        if (tripData.description !== undefined) updateData.description = tripData.description;
        if (tripData.imageUrl !== undefined) updateData.imageUrl = tripData.imageUrl;
        if (tripData.status !== undefined) updateData.status = tripData.status;
        if (tripData.groupId !== undefined) updateData.groupId = tripData.groupId;
        if (tripData.recurrencePattern !== undefined) updateData.recurrencePattern = tripData.recurrencePattern;
        if (tripData.isRecurring !== undefined) updateData.isRecurring = tripData.isRecurring;
        if (tripData.notes !== undefined) updateData.notes = tripData.notes;
        if (tripData.isMultiStop !== undefined) updateData.isMultiStop = tripData.isMultiStop;
        if (tripData.distanceTraveled !== undefined) updateData.distanceTraveled = tripData.distanceTraveled;
        
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
        
        console.log("[STORAGE] Update data before final log:", {
          name: updateData.name,
          startLocation: updateData.startLocation,
          destination: updateData.destination,
          status: updateData.status,
          startDate: updateData.startDate,
          endDate: updateData.endDate
        });
        
        // Check for startLocation specifically
        console.log("[STORAGE] Is startLocation in updateData?", 'startLocation' in updateData);
        console.log("[STORAGE] All keys in updateData:", Object.keys(updateData));
        console.log("[STORAGE] startLocation value directly:", updateData.startLocation);
        
        console.log("[STORAGE] Final update data:", JSON.stringify(updateData));
        
        // Execute the update - make absolutely sure we include startLocation by hardcoding it if needed
        // This is a workaround for an apparent issue with the updateData object
        let missingStartLocation = false;
        if (tripData.startLocation !== undefined && updateData.startLocation === undefined) {
          console.log("[STORAGE] PROBLEM DETECTED: startLocation was in tripData but not in updateData. Force-adding it.");
          updateData.startLocation = tripData.startLocation;
          missingStartLocation = true;
        }
        
        // Directly log all properties and values of updateData object
        console.log("[STORAGE] updateData object properties:");
        for (const key in updateData) {
          console.log(`${key}: ${updateData[key]}`);
        }
        
        // Check if updateData is completely empty and throw an error
        if (Object.keys(updateData).length === 0) {
          console.error("[STORAGE] ERROR: updateData is empty!");
          throw new Error("No values to set - empty update object");
        }
        
        // If we're still missing startLocation but we know it should be set, use a direct update
        let updatedTrip;
        if (missingStartLocation) {
          console.log("[STORAGE] Using direct column reference for startLocation");
          const [result] = await db
            .update(trips)
            .set({
              ...updateData,
              startLocation: tripData.startLocation
            })
            .where(eq(trips.id, id))
            .returning();
          updatedTrip = result;
        } else {
          // Normal update
          const [result] = await db
            .update(trips)
            .set(updateData)
            .where(eq(trips.id, id))
            .returning();
          updatedTrip = result;
        }
        
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
      
      // Get trips created by the user
      const userCreatedTrips = await db.select().from(trips).where(eq(trips.createdBy, userId));
      
      // If no group memberships, just return user-created trips
      if (groupIds.length === 0) {
        return userCreatedTrips;
      }
      
      // Get all trips associated with those groups
      const groupTrips = await db.select().from(trips).where(inArray(trips.groupId, groupIds));
      
      // Combine and deduplicate (a trip might be both user-created and in a group)
      const allTrips = [...userCreatedTrips];
      
      // Add group trips that aren't already included (not created by the user)
      for (const trip of groupTrips) {
        if (!allTrips.some(t => t.id === trip.id)) {
          allTrips.push(trip);
        }
      }
      
      return allTrips;
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
      // Process the item data before insertion
      console.log("[STORAGE] Creating itinerary item with data:", JSON.stringify(insertItem));
      
      // Create a copy of the data for manipulation
      const itemData = { ...insertItem };
      
      // Ensure isRecurring is a boolean
      if (itemData.isRecurring === undefined) {
        itemData.isRecurring = false;
      }
      
      // Handle recurrence days if they're passed as an array
      if (itemData.recurrenceDays && Array.isArray(itemData.recurrenceDays)) {
        itemData.recurrenceDays = JSON.stringify(itemData.recurrenceDays);
      }
      
      // Insert the data
      const [item] = await db.insert(itineraryItems).values(itemData).returning();
      console.log("[STORAGE] Itinerary item created:", JSON.stringify(item));
      return item;
    });
  }

  async getItineraryItemsByTripId(tripId: number): Promise<ItineraryItem[]> {
    return this.executeDbOperation(async () => {
      const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
      
      // Process each item to handle stored data formats
      return items.map(item => {
        const processedItem = { ...item };
        
        // Parse recurrenceDays if it's a string
        if (processedItem.recurrenceDays && typeof processedItem.recurrenceDays === 'string') {
          try {
            processedItem.recurrenceDays = JSON.parse(processedItem.recurrenceDays);
          } catch (error) {
            console.error(`[STORAGE] Error parsing recurrenceDays for item ${item.id}:`, error);
            // Keep as is if parsing fails
          }
        }
        
        return processedItem;
      });
    });
  }
  
  async getItineraryItem(id: number): Promise<ItineraryItem | undefined> {
    return this.executeDbOperation(async () => {
      const [item] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id));
      
      if (!item) {
        return undefined;
      }
      
      // Process item to handle stored data formats
      const processedItem = { ...item };
      
      // Parse recurrenceDays if it's a string
      if (processedItem.recurrenceDays && typeof processedItem.recurrenceDays === 'string') {
        try {
          processedItem.recurrenceDays = JSON.parse(processedItem.recurrenceDays);
        } catch (error) {
          console.error(`[STORAGE] Error parsing recurrenceDays for item ${item.id}:`, error);
          // Keep as is if parsing fails
        }
      }
      
      return processedItem;
    });
  }
  
  async updateItineraryItem(id: number, itemData: Partial<InsertItineraryItem>): Promise<ItineraryItem | undefined> {
    return this.executeDbOperation(async () => {
      // Process the item data before updating
      console.log("[STORAGE] Updating itinerary item with data:", JSON.stringify(itemData));
      
      // Create a copy of the data for manipulation
      const updateData = { ...itemData };
      
      // Handle recurrence days if they're passed as an array
      if (updateData.recurrenceDays && Array.isArray(updateData.recurrenceDays)) {
        updateData.recurrenceDays = JSON.stringify(updateData.recurrenceDays);
      }
      
      // Update the data
      const [item] = await db.update(itineraryItems)
        .set(updateData)
        .where(eq(itineraryItems.id, id))
        .returning();
      
      if (!item) {
        return undefined;
      }
      
      // Process the returned item to handle stored data formats
      const processedItem = { ...item };
      
      // Parse recurrenceDays if it's a string
      if (processedItem.recurrenceDays && typeof processedItem.recurrenceDays === 'string') {
        try {
          processedItem.recurrenceDays = JSON.parse(processedItem.recurrenceDays);
        } catch (error) {
          console.error(`[STORAGE] Error parsing recurrenceDays for item ${item.id}:`, error);
          // Keep as is if parsing fails
        }
      }
      
      console.log("[STORAGE] Itinerary item updated:", JSON.stringify(processedItem));
      return processedItem;
    });
  }
  
  async deleteItineraryItem(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Deleting itinerary item with id ${id}`);
      const result = await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
      const rowCount = result.rowCount || 0;
      const success = rowCount > 0;
      console.log(`[STORAGE] Itinerary item deletion result: ${success ? 'successful' : 'failed'}`);
      return success;
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

  // Check-in methods
  async createTripCheckIn(checkIn: InsertTripCheckIn): Promise<TripCheckIn> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Creating trip check-in with data:", JSON.stringify(checkIn));
      const [checkInRecord] = await db.insert(tripCheckIns).values(checkIn).returning();
      console.log("[STORAGE] Trip check-in created:", JSON.stringify(checkInRecord));
      return checkInRecord;
    });
  }

  async getTripCheckIns(tripId: number): Promise<TripCheckIn[]> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Getting check-ins for trip:", tripId);
      const checkIns = await db.select().from(tripCheckIns).where(eq(tripCheckIns.tripId, tripId));
      console.log(`[STORAGE] Found ${checkIns.length} check-ins for trip ${tripId}`);
      return checkIns;
    });
  }

  async getUserTripCheckIn(tripId: number, userId: number): Promise<TripCheckIn | undefined> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting check-in for trip ${tripId} and user ${userId}`);
      const [checkIn] = await db
        .select()
        .from(tripCheckIns)
        .where(
          and(
            eq(tripCheckIns.tripId, tripId),
            eq(tripCheckIns.userId, userId)
          )
        );
      return checkIn;
    });
  }

  async updateTripCheckIn(id: number, data: Partial<InsertTripCheckIn>): Promise<TripCheckIn | undefined> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Updating check-in ${id} with data:`, JSON.stringify(data));
      
      // Make a copy of data to avoid modifying the original
      const updateData = { ...data };
      
      // Never update these fields
      delete updateData.tripId;
      delete updateData.userId;
      
      const [updatedCheckIn] = await db
        .update(tripCheckIns)
        .set(updateData)
        .where(eq(tripCheckIns.id, id))
        .returning();
      
      console.log("[STORAGE] Updated check-in result:", JSON.stringify(updatedCheckIn));
      return updatedCheckIn;
    });
  }

  async deleteTripCheckIn(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Deleting check-in ${id}`);
      const result = await db
        .delete(tripCheckIns)
        .where(eq(tripCheckIns.id, id))
        .returning({ id: tripCheckIns.id });
      
      console.log(`[STORAGE] Delete check-in result: ${result.length > 0 ? 'success' : 'failed'}`);
      return result.length > 0;
    });
  }

  async getAllTripCheckInStatus(tripId: number): Promise<{ userId: number; status: string }[]> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting all check-in statuses for trip ${tripId}`);
      const checkIns = await db
        .select({
          userId: tripCheckIns.userId,
          status: tripCheckIns.status
        })
        .from(tripCheckIns)
        .where(eq(tripCheckIns.tripId, tripId));
      
      console.log(`[STORAGE] Found ${checkIns.length} check-in statuses`);
      // Filter out null statuses and provide default for type safety
      return checkIns.map(checkIn => ({
        userId: checkIn.userId,
        status: checkIn.status || 'unknown'
      }));
    });
  }

  // Child profile methods
  async createChild(insertChild: InsertChild): Promise<Child> {
    return this.executeDbOperation(async () => {
      const [child] = await db.insert(children).values(insertChild).returning();
      return child;
    });
  }

  async getChildById(id: number): Promise<Child | undefined> {
    return this.executeDbOperation(async () => {
      const [child] = await db.select().from(children).where(eq(children.id, id));
      return child;
    });
  }

  async getChildrenByUserId(userId: number): Promise<Child[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(children).where(eq(children.userId, userId));
    });
  }

  async updateChild(id: number, childData: Partial<InsertChild>): Promise<Child | undefined> {
    return this.executeDbOperation(async () => {
      const [updatedChild] = await db
        .update(children)
        .set(childData)
        .where(eq(children.id, id))
        .returning();
      return updatedChild;
    });
  }

  async deleteChild(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      const result = await db
        .delete(children)
        .where(eq(children.id, id))
        .returning({ id: children.id });
      return result.length > 0;
    });
  }
  
  // Saved Locations methods
  async getSavedLocations(userId: number, limit?: number): Promise<SavedLocation[]> {
    return await this.executeDbOperation(async () => {
      const query = db.select().from(savedLocations)
        .where(eq(savedLocations.userId, userId))
        .orderBy(desc(savedLocations.visitCount));
        
      const results = limit ? await query.limit(limit) : await query;
      return results;
    }, 2); // Allow 2 retries
  }
  
  async getSavedLocation(id: number): Promise<SavedLocation | undefined> {
    return await this.executeDbOperation(async () => {
      const [location] = await db.select().from(savedLocations).where(eq(savedLocations.id, id));
      return location;
    });
  }
  
  async createSavedLocation(location: InsertSavedLocation): Promise<SavedLocation> {
    return await this.executeDbOperation(async () => {
      // Check if a similar location already exists for this user
      const [existingLocation] = await db.select().from(savedLocations)
        .where(and(
          eq(savedLocations.userId, location.userId),
          eq(savedLocations.address, location.address)
        ));
        
      // If exists, increment the visit count instead of creating a new one
      if (existingLocation) {
        const updated = await this.incrementLocationVisitCount(existingLocation.id);
        if (!updated) throw new Error("Failed to update existing location");
        return updated;
      }
      
      // Otherwise create a new location
      const [newLocation] = await db.insert(savedLocations).values(location).returning();
      return newLocation;
    });
  }
  
  async updateSavedLocation(id: number, data: Partial<InsertSavedLocation>): Promise<SavedLocation | undefined> {
    return await this.executeDbOperation(async () => {
      const [updatedLocation] = await db
        .update(savedLocations)
        .set(data)
        .where(eq(savedLocations.id, id))
        .returning();
      return updatedLocation;
    });
  }
  
  async incrementLocationVisitCount(id: number): Promise<SavedLocation | undefined> {
    return await this.executeDbOperation(async () => {
      const [location] = await db.select().from(savedLocations).where(eq(savedLocations.id, id));
      if (!location) return undefined;
      
      const [updatedLocation] = await db
        .update(savedLocations)
        .set({
          visitCount: location.visitCount + 1,
          lastVisited: new Date(),
        })
        .where(eq(savedLocations.id, id))
        .returning();
      return updatedLocation;
    });
  }
  
  async deleteSavedLocation(id: number): Promise<boolean> {
    return await this.executeDbOperation(async () => {
      const result = await db.delete(savedLocations).where(eq(savedLocations.id, id));
      return true;
    }, 1);
  }
  
  // Driver Assignment methods
  async createDriverAssignment(assignment: InsertTripDriverAssignment): Promise<TripDriverAssignment> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Creating driver assignment with data:", JSON.stringify(assignment));
      const [driverAssignment] = await db.insert(tripDriverAssignments).values(assignment).returning();
      return driverAssignment;
    });
  }

  async getAllDriverAssignments(): Promise<TripDriverAssignment[]> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting all driver assignments`);
      const assignments = await db.select().from(tripDriverAssignments)
        .orderBy(tripDriverAssignments.startDate);
      
      // Try to enrich with trip names, driver names, etc.
      const enrichedAssignments = await Promise.all(assignments.map(async (assignment) => {
        try {
          // Get trip details
          const trip = await this.getTrip(assignment.tripId);
          
          // Get driver details
          const driver = await this.getUser(assignment.driverId);
          
          // Get vehicle details if applicable
          let vehicle = null;
          if (assignment.vehicleId) {
            vehicle = await this.getVehicle(assignment.vehicleId);
          }
          
          // Get assigner details
          const assigner = await this.getUser(assignment.assignedBy);
          
          return {
            ...assignment,
            tripName: trip?.name,
            driverName: driver?.displayName || driver?.username,
            vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
            assignerName: assigner?.displayName || assigner?.username,
          };
        } catch (error) {
          console.error(`[STORAGE] Error enriching driver assignment ${assignment.id}:`, error);
          return assignment;
        }
      }));
      
      console.log(`[STORAGE] Found ${enrichedAssignments.length} total driver assignments`);
      return enrichedAssignments;
    });
  }

  async getDriverAssignments(tripId: number): Promise<TripDriverAssignment[]> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting driver assignments for trip ${tripId}`);
      const assignments = await db.select().from(tripDriverAssignments)
        .where(eq(tripDriverAssignments.tripId, tripId))
        .orderBy(tripDriverAssignments.startDate);
      console.log(`[STORAGE] Found ${assignments.length} driver assignments for trip ${tripId}`);
      return assignments;
    });
  }

  async getDriverAssignment(id: number): Promise<TripDriverAssignment | undefined> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting driver assignment with id ${id}`);
      const [assignment] = await db.select().from(tripDriverAssignments)
        .where(eq(tripDriverAssignments.id, id));
      return assignment;
    });
  }

  async updateDriverAssignment(id: number, data: Partial<InsertTripDriverAssignment>): Promise<TripDriverAssignment | undefined> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Updating driver assignment ${id} with data:`, JSON.stringify(data));
      
      // Make a copy of data to avoid modifying the original
      const updateData = { ...data };
      
      // Never update these fields
      delete updateData.tripId;
      
      const [updatedAssignment] = await db
        .update(tripDriverAssignments)
        .set(updateData)
        .where(eq(tripDriverAssignments.id, id))
        .returning();
      
      console.log(`[STORAGE] Updated driver assignment:`, JSON.stringify(updatedAssignment));
      return updatedAssignment;
    });
  }

  async deleteDriverAssignment(id: number): Promise<boolean> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Deleting driver assignment ${id}`);
      const result = await db
        .delete(tripDriverAssignments)
        .where(eq(tripDriverAssignments.id, id));
      return !!result;
    });
  }
  
  // Get all eligible drivers (users with isEligibleDriver=true)
  async getEligibleDrivers(): Promise<User[]> {
    return this.executeDbOperation(async () => {
      console.log(`[STORAGE] Getting all eligible drivers`);
      const drivers = await db.select().from(users)
        .where(eq(users.isEligibleDriver, true))
        .orderBy(users.displayName);
      console.log(`[STORAGE] Found ${drivers.length} eligible drivers`);
      return drivers;
    });
  }

  // Trip modification request methods
  async createTripModificationRequest(data: InsertTripModificationRequest): Promise<TripModificationRequest> {
    return this.executeDbOperation(async () => {
      console.log("[STORAGE] Creating trip modification request:", JSON.stringify(data));
      const [result] = await db.insert(tripModificationRequests).values(data).returning();
      return result;
    });
  }

  async getTripModificationRequestById(id: number): Promise<TripModificationRequest | undefined> {
    return this.executeDbOperation(async () => {
      const [result] = await db.select().from(tripModificationRequests).where(eq(tripModificationRequests.id, id));
      return result;
    });
  }

  async getTripModificationRequestsByTripId(tripId: number): Promise<TripModificationRequest[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(tripModificationRequests).where(eq(tripModificationRequests.tripId, tripId));
    });
  }

  async getPendingTripModificationRequests(): Promise<TripModificationRequest[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(tripModificationRequests).where(eq(tripModificationRequests.status, "pending"));
    });
  }

  async getRequestsByUser(userId: number): Promise<TripModificationRequest[]> {
    return this.executeDbOperation(async () => {
      return await db.select().from(tripModificationRequests).where(eq(tripModificationRequests.requestedBy, userId));
    });
  }

  async updateTripModificationRequestStatus(id: number, status: string, reviewerId: number, notes?: string): Promise<TripModificationRequest | undefined> {
    return this.executeDbOperation(async () => {
      const updateData: any = {
        status,
        reviewedBy: reviewerId,
        updatedAt: new Date()
      };
      
      if (notes) {
        updateData.adminNotes = notes;
      }
      
      const [result] = await db
        .update(tripModificationRequests)
        .set(updateData)
        .where(eq(tripModificationRequests.id, id))
        .returning();
        
      return result;
    });
  }

  async approveTripModificationRequest(id: number, adminId: number, notes?: string): Promise<TripModificationRequest | undefined> {
    return this.updateTripModificationRequestStatus(id, "approved", adminId, notes);
  }

  async rejectTripModificationRequest(id: number, adminId: number, notes?: string): Promise<TripModificationRequest | undefined> {
    return this.updateTripModificationRequestStatus(id, "rejected", adminId, notes);
  }
}

export const storage = new DatabaseStorage();
