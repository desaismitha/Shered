import { pgTable, text, serial, integer, boolean, timestamp, json, jsonb, doublePrecision } from "drizzle-orm/pg-core";
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
  phoneNumber: text("phone_number"),
  // User role: Admin, Parent/Guardian, Nanny/Driver, School/Organization
  role: text("role").default("Parent/Guardian"),
  createdAt: timestamp("created_at").defaultNow(),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  // OTP (One-Time Password)
  otpToken: text("otp_token"),
  otpTokenExpiry: timestamp("otp_token_expiry"),
  // Driver license information
  licenseNumber: text("license_number"),
  licenseState: text("license_state"),
  licenseExpiry: timestamp("license_expiry"),
  isEligibleDriver: boolean("is_eligible_driver").default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  // Add validation for email format
  email: z.string().email("Please enter a valid email address"),
  // Add validation for phone number format - Relaxed validation to handle various formats
  phoneNumber: z.string().transform(val => val.replace(/[^0-9+]/g, '')).optional(),
  // Add validation for password (min 6 characters)
  password: z.string().min(6, "Password must be at least 6 characters"),
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
  // Status can be: planning, confirmed, in-progress, completed, cancelled
  status: text("status").default("planning"),
  // Location tracking for in-progress trips
  currentLatitude: doublePrecision("current_latitude"),
  currentLongitude: doublePrecision("current_longitude"),
  lastLocationUpdate: timestamp("last_location_update"),
  // Distance traveled in kilometers
  distanceTraveled: doublePrecision("distance_traveled").default(0),
  // Mobile notifications for route changes
  enableMobileNotifications: boolean("enable_mobile_notifications").default(false),
  groupId: integer("group_id").references(() => groups.id, { onDelete: 'set null' }),
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
  isRecurring: boolean("is_recurring").default(false),
  recurrencePattern: text("recurrence_pattern"), // Values like "daily", "weekdays", "weekends", "specific-days"
  recurrenceDays: text("recurrence_days"), // JSON array of days (e.g., ["mon","tue","wed"])
  fromLocation: text("from_location"), // For pickup/dropoff use case
  toLocation: text("to_location"), // For pickup/dropoff use case
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

// Trip check-ins schema
export const tripCheckIns = pgTable("trip_check_ins", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  userId: integer("user_id").notNull().references(() => users.id),
  checkedInAt: timestamp("checked_in_at").defaultNow(),
  status: text("status").default("ready"), // ready, not-ready, delayed
  notes: text("notes"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  locationVerified: boolean("location_verified").default(false),
});

export const insertTripCheckInSchema = createInsertSchema(tripCheckIns).omit({
  id: true,
  checkedInAt: true,
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
  tripCheckIns: many(tripCheckIns, { relationName: "user_check_ins" }),
  children: many(children, { relationName: "user_children" }),
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
  checkIns: many(tripCheckIns, { relationName: "trip_check_ins" }),
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

export const tripCheckInsRelations = relations(tripCheckIns, ({ one }) => ({
  trip: one(trips, {
    fields: [tripCheckIns.tripId],
    references: [trips.id],
    relationName: "trip_check_ins",
  }),
  user: one(users, {
    fields: [tripCheckIns.userId],
    references: [users.id],
    relationName: "user_check_ins",
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

export type TripCheckIn = typeof tripCheckIns.$inferSelect;
export type InsertTripCheckIn = z.infer<typeof insertTripCheckInSchema>;

// Children schema
export const children = pgTable("children", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  pictureUrl: text("picture_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChildSchema = createInsertSchema(children).omit({
  id: true,
  createdAt: true,
}).extend({
  // Add validation for email format (optional)
  email: z.string().email("Please enter a valid email address").optional().nullable(),
  // Add validation for phone number format (optional)
  phoneNumber: z.string().transform(val => val ? val.replace(/[^0-9+]/g, '') : val).optional().nullable(),
});

// Relations for children
export const childrenRelations = relations(children, ({ one }) => ({
  parent: one(users, {
    fields: [children.userId],
    references: [users.id],
    relationName: "user_children",
  }),
}));

// Child type
export type Child = typeof children.$inferSelect;
export type InsertChild = z.infer<typeof insertChildSchema>;

// Trip modification request schema for schedule changes that need admin approval
export const tripModificationRequests = pgTable("trip_modification_requests", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  requestData: jsonb("request_data").notNull(), // JSON containing the requested changes
  adminNotes: text("admin_notes"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTripModificationRequestSchema = createInsertSchema(tripModificationRequests).omit({ 
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedBy: true,
  status: true 
}).extend({
  adminNotes: z.string().optional().nullable()
});

export const tripModificationRequestsRelations = relations(tripModificationRequests, ({ one }) => ({
  trip: one(trips, {
    fields: [tripModificationRequests.tripId],
    references: [trips.id],
  }),
  requestedByUser: one(users, {
    fields: [tripModificationRequests.requestedBy],
    references: [users.id],
    relationName: "requestedByUser",
  }),
  reviewedByUser: one(users, {
    fields: [tripModificationRequests.reviewedBy],
    references: [users.id],
    relationName: "reviewedByUser",
  }),
}));

export type TripModificationRequest = typeof tripModificationRequests.$inferSelect;
export type InsertTripModificationRequest = z.infer<typeof insertTripModificationRequestSchema>;
