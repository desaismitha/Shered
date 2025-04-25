import { users, groups, groupMembers, trips, itineraryItems, expenses, messages } from "@shared/schema";
import type { User, InsertUser, Group, InsertGroup, GroupMember, InsertGroupMember, Trip, InsertTrip, ItineraryItem, InsertItineraryItem, Expense, InsertExpense, Message, InsertMessage } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private groups: Map<number, Group>;
  private groupMembers: Map<number, GroupMember>;
  private trips: Map<number, Trip>;
  private itineraryItems: Map<number, ItineraryItem>;
  private expenses: Map<number, Expense>;
  private messages: Map<number, Message>;
  
  sessionStore: session.SessionStore;
  
  private userIdCounter: number;
  private groupIdCounter: number;
  private groupMemberIdCounter: number;
  private tripIdCounter: number;
  private itineraryItemIdCounter: number;
  private expenseIdCounter: number;
  private messageIdCounter: number;

  constructor() {
    this.users = new Map();
    this.groups = new Map();
    this.groupMembers = new Map();
    this.trips = new Map();
    this.itineraryItems = new Map();
    this.expenses = new Map();
    this.messages = new Map();
    
    this.userIdCounter = 1;
    this.groupIdCounter = 1;
    this.groupMemberIdCounter = 1;
    this.tripIdCounter = 1;
    this.itineraryItemIdCounter = 1;
    this.expenseIdCounter = 1;
    this.messageIdCounter = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { ...insertUser, id, createdAt: now };
    this.users.set(id, user);
    return user;
  }

  // Group methods
  async createGroup(insertGroup: InsertGroup): Promise<Group> {
    const id = this.groupIdCounter++;
    const now = new Date();
    const group: Group = { ...insertGroup, id, createdAt: now };
    this.groups.set(id, group);
    
    // Automatically add creator as a member with "admin" role
    await this.addUserToGroup({
      groupId: id,
      userId: insertGroup.createdBy,
      role: "admin"
    });
    
    return group;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    return this.groups.get(id);
  }

  async getGroupsByUserId(userId: number): Promise<Group[]> {
    const userGroupMemberships = Array.from(this.groupMembers.values()).filter(
      (member) => member.userId === userId
    );
    
    return userGroupMemberships.map(
      (member) => this.groups.get(member.groupId)!
    ).filter(Boolean);
  }

  async addUserToGroup(insertGroupMember: InsertGroupMember): Promise<GroupMember> {
    const id = this.groupMemberIdCounter++;
    const now = new Date();
    const groupMember: GroupMember = { ...insertGroupMember, id, joinedAt: now };
    this.groupMembers.set(id, groupMember);
    return groupMember;
  }

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    return Array.from(this.groupMembers.values()).filter(
      (member) => member.groupId === groupId
    );
  }

  // Trip methods
  async createTrip(insertTrip: InsertTrip): Promise<Trip> {
    const id = this.tripIdCounter++;
    const now = new Date();
    const trip: Trip = { ...insertTrip, id, createdAt: now };
    this.trips.set(id, trip);
    return trip;
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    return this.trips.get(id);
  }

  async getTripsByUserId(userId: number): Promise<Trip[]> {
    // Get all groups the user is a member of
    const userGroups = await this.getGroupsByUserId(userId);
    const userGroupIds = userGroups.map(group => group.id);
    
    // Get all trips associated with those groups
    return Array.from(this.trips.values()).filter(
      (trip) => userGroupIds.includes(trip.groupId)
    );
  }

  async getTripsByGroupId(groupId: number): Promise<Trip[]> {
    return Array.from(this.trips.values()).filter(
      (trip) => trip.groupId === groupId
    );
  }

  // Itinerary methods
  async createItineraryItem(insertItem: InsertItineraryItem): Promise<ItineraryItem> {
    const id = this.itineraryItemIdCounter++;
    const item: ItineraryItem = { ...insertItem, id };
    this.itineraryItems.set(id, item);
    return item;
  }

  async getItineraryItemsByTripId(tripId: number): Promise<ItineraryItem[]> {
    return Array.from(this.itineraryItems.values()).filter(
      (item) => item.tripId === tripId
    );
  }

  // Expense methods
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const id = this.expenseIdCounter++;
    const now = new Date();
    const expense: Expense = { ...insertExpense, id, createdAt: now };
    this.expenses.set(id, expense);
    return expense;
  }

  async getExpensesByTripId(tripId: number): Promise<Expense[]> {
    return Array.from(this.expenses.values()).filter(
      (expense) => expense.tripId === tripId
    );
  }

  async getExpensesByUserId(userId: number): Promise<Expense[]> {
    return Array.from(this.expenses.values()).filter(
      (expense) => expense.paidBy === userId || expense.splitAmong.includes(userId)
    );
  }

  // Message methods
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const now = new Date();
    const message: Message = { ...insertMessage, id, createdAt: now };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByGroupId(groupId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.groupId === groupId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new MemStorage();
