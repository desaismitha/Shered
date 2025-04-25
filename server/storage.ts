import { users, groups, groupMembers, trips, itineraryItems, expenses, messages } from "@shared/schema";
import type { User, InsertUser, Group, InsertGroup, GroupMember, InsertGroupMember, Trip, InsertTrip, ItineraryItem, InsertItineraryItem, Expense, InsertExpense, Message, InsertMessage } from "@shared/schema";
import session from "express-session";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import connectPg from "connect-pg-simple";

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

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Group methods
  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    const [group] = await db.insert(groups).values(insertGroup).returning();
    
    // Automatically add creator as a member with "admin" role
    await this.addUserToGroup({
      groupId: group.id,
      userId: insertGroup.createdBy,
      role: "admin"
    });
    
    return group;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async getGroupsByUserId(userId: number): Promise<Group[]> {
    // Get group IDs the user is a member of
    const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
    const groupIds = memberships.map(m => m.groupId);
    
    if (groupIds.length === 0) {
      return [];
    }
    
    // Get the groups
    return await db.select().from(groups).where(inArray(groups.id, groupIds));
  }

  async addUserToGroup(insertGroupMember: InsertGroupMember): Promise<GroupMember> {
    const [member] = await db.insert(groupMembers).values(insertGroupMember).returning();
    return member;
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  }

  // Trip methods
  async createTrip(insertTrip: InsertTrip): Promise<Trip> {
    const [trip] = await db.insert(trips).values(insertTrip).returning();
    return trip;
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async getTripsByUserId(userId: number): Promise<Trip[]> {
    // Get all groups the user is a member of
    const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
    const groupIds = memberships.map(m => m.groupId);
    
    if (groupIds.length === 0) {
      return [];
    }
    
    // Get all trips associated with those groups
    return await db.select().from(trips).where(inArray(trips.groupId, groupIds));
  }

  async getTripsByGroupId(groupId: number): Promise<Trip[]> {
    return await db.select().from(trips).where(eq(trips.groupId, groupId));
  }

  // Itinerary methods
  async createItineraryItem(insertItem: InsertItineraryItem): Promise<ItineraryItem> {
    const [item] = await db.insert(itineraryItems).values(insertItem).returning();
    return item;
  }

  async getItineraryItemsByTripId(tripId: number): Promise<ItineraryItem[]> {
    return await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  }

  // Expense methods
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    // Make sure we're sending valid data to the database
    const validExpenseData = {
      tripId: insertExpense.tripId,
      title: insertExpense.title,
      amount: insertExpense.amount,
      paidBy: insertExpense.paidBy,
      splitAmong: insertExpense.splitAmong,
      date: insertExpense.date || null,
      category: insertExpense.category || null,
    };
    
    const [expense] = await db.insert(expenses).values(validExpenseData).returning();
    return expense;
  }

  async getExpensesByTripId(tripId: number): Promise<Expense[]> {
    return await db.select().from(expenses).where(eq(expenses.tripId, tripId));
  }

  async getExpensesByUserId(userId: number): Promise<Expense[]> {
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
  }

  // Message methods
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async getMessagesByGroupId(groupId: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.groupId, groupId))
      .orderBy(messages.createdAt);
  }
}

export const storage = new DatabaseStorage();
