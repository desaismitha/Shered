import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  // Driver license information
  licenseNumber: text("license_number"),
  licenseState: text("license_state"),
  licenseExpiry: timestamp("license_expiry"),
  isEligibleDriver: boolean("is_eligible_driver").default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Group schema
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
});

// Group members schema
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const insertGroupMemberSchema = createInsertSchema(groupMembers).omit({
  id: true,
  joinedAt: true,
});

// Trip schema
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startLocation: text("start_location"),
  destination: text("destination").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  status: text("status").default("planning"),
  groupId: integer("group_id").references(() => groups.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  createdAt: true,
});

// Itinerary item schema
export const itineraryItems = pgTable("itinerary_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  day: integer("day").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

export const insertItineraryItemSchema = createInsertSchema(itineraryItems).omit({
  id: true,
});

// Expense schema
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  title: text("title").notNull(),
  amount: integer("amount").notNull(), // Amount in cents
  paidBy: integer("paid_by").notNull().references(() => users.id),
  splitAmong: text("split_among").notNull(), // JSON string containing array of user IDs
  date: timestamp("date").defaultNow(),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

// Message schema
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

// Vehicle schema
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year"),
  licensePlate: text("license_plate"),
  color: text("color"),
  capacity: integer("capacity").default(5),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
});

// Trip vehicle association
export const tripVehicles = pgTable("trip_vehicles", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  isMain: boolean("is_main").default(true),
  assignedTo: integer("assigned_to").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTripVehicleSchema = createInsertSchema(tripVehicles).omit({
  id: true,
  createdAt: true,
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  groups: many(groups, { relationName: "user_groups" }),
  groupMemberships: many(groupMembers, { relationName: "user_memberships" }),
  trips: many(trips, { relationName: "user_trips" }),
  itineraryItems: many(itineraryItems, { relationName: "user_itinerary_items" }),
  expenses: many(expenses, { relationName: "user_expenses" }),
  messages: many(messages, { relationName: "user_messages" }),
  vehicles: many(vehicles, { relationName: "user_vehicles" }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(users, {
    fields: [groups.createdBy],
    references: [users.id],
    relationName: "user_groups",
  }),
  members: many(groupMembers, { relationName: "group_members" }),
  trips: many(trips, { relationName: "group_trips" }),
  messages: many(messages, { relationName: "group_messages" }),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
    relationName: "group_members",
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
    relationName: "user_memberships",
  }),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  group: one(groups, {
    fields: [trips.groupId],
    references: [groups.id],
    relationName: "group_trips",
  }),
  creator: one(users, {
    fields: [trips.createdBy],
    references: [users.id],
    relationName: "user_trips",
  }),
  itineraryItems: many(itineraryItems, { relationName: "trip_itinerary" }),
  expenses: many(expenses, { relationName: "trip_expenses" }),
  vehicles: many(tripVehicles, { relationName: "trip_vehicles" }),
}));

export const itineraryItemsRelations = relations(itineraryItems, ({ one }) => ({
  trip: one(trips, {
    fields: [itineraryItems.tripId],
    references: [trips.id],
    relationName: "trip_itinerary",
  }),
  creator: one(users, {
    fields: [itineraryItems.createdBy],
    references: [users.id],
    relationName: "user_itinerary_items",
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  trip: one(trips, {
    fields: [expenses.tripId],
    references: [trips.id],
    relationName: "trip_expenses",
  }),
  payer: one(users, {
    fields: [expenses.paidBy],
    references: [users.id],
    relationName: "user_expenses",
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  group: one(groups, {
    fields: [messages.groupId],
    references: [groups.id],
    relationName: "group_messages",
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
    relationName: "user_messages",
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  owner: one(users, {
    fields: [vehicles.userId],
    references: [users.id],
    relationName: "user_vehicles",
  }),
  trips: many(tripVehicles, { relationName: "vehicle_trips" }),
}));

export const tripVehiclesRelations = relations(tripVehicles, ({ one }) => ({
  trip: one(trips, {
    fields: [tripVehicles.tripId],
    references: [trips.id],
    relationName: "trip_vehicles",
  }),
  vehicle: one(vehicles, {
    fields: [tripVehicles.vehicleId],
    references: [vehicles.id],
    relationName: "vehicle_trips",
  }),
  assignee: one(users, {
    fields: [tripVehicles.assignedTo],
    references: [users.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;

export type ItineraryItem = typeof itineraryItems.$inferSelect;
export type InsertItineraryItem = z.infer<typeof insertItineraryItemSchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

export type TripVehicle = typeof tripVehicles.$inferSelect;
export type InsertTripVehicle = z.infer<typeof insertTripVehicleSchema>;
