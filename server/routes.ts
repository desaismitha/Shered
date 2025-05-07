import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';

// Track which users are connected and their group memberships
const connectedUserGroups: { userId: number; groupId: number }[] = [];
import { storage } from "./storage";
import { setupImportRoutes } from "./import";
import { setupPhoneVerificationRoutes } from "./phone-verification";
import fileUpload from "express-fileupload";
import { db, attemptReconnect, checkDbConnection, cleanupConnections } from "./db";
import { setupAuth, hashPassword, generateOTP } from "./auth";
import { insertGroupSchema, insertTripSchema, insertItineraryItemSchema, insertExpenseSchema, insertMessageSchema, insertGroupMemberSchema, insertVehicleSchema, insertTripVehicleSchema, users, groupMembers, trips, itineraryItems } from "@shared/schema";
import { z } from "zod";
import { eq, or, and, asc, desc, sql, isNull, count, between, lt } from "drizzle-orm";
import { sendGroupInvitation, sendPasswordResetEmail, sendRouteDeviationEmail, sendTripStatusChangeEmail, sendOTPVerificationCode, sendRegistrationConfirmation } from "./email";
import crypto from "crypto";
import fetch from "node-fetch";

// Map to store active WebSocket connections by user ID
const userConnections = new Map<number, WebSocket>();

/**
 * Send a notification to all group members about a route deviation
 * @param groupId The ID of the group to notify members of
 * @param tripId The ID of the trip with the deviation
 * @param tripName The name of the trip
 * @param username The username of the person who deviated
 * @param distanceFromRoute The distance from the route in km
 * @param latitude Current latitude
 * @param longitude Current longitude
 */
async function notifyGroupAboutDeviation(
  groupId: number,
  tripId: number,
  tripName: string,
  username: string,
  distanceFromRoute: number,
  latitude: number,
  longitude: number
) {
  try {
    // Only proceed if there's a valid group
    if (!groupId) {
      console.log('Cannot send deviation notification - no group associated with trip');
      return;
    }
    
    // Get all group members
    const groupMembers = await storage.getGroupMembers(groupId);
    if (!groupMembers || groupMembers.length === 0) {
      console.log('No group members to notify about deviation');
      return;
    }
    
    const notification = {
      type: 'route-deviation',
      tripId,
      tripName,
      username,
      message: `${username} has deviated from the planned route by ${distanceFromRoute.toFixed(2)}km`,
      distanceFromRoute,
      coordinates: { latitude, longitude },
      timestamp: new Date().toISOString()
    };
    
    // Get the user IDs of all group members
    const memberIds = groupMembers.map(member => member.userId);
    console.log(`Sending deviation notification to ${memberIds.length} group members`);
    
    // Send to all connected group members via WebSocket (for real-time UI updates)
    let wsCount = 0;
    for (const userId of memberIds) {
      const connection = userConnections.get(userId);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(notification));
        wsCount++;
      }
    }
    
    console.log(`Sent WebSocket notifications to ${wsCount} connected group members`);
    
    // Also send email notifications to ALL group members
    let emailCount = 0;
    for (const member of groupMembers) {
      try {
        // Get the user's details to have their email address
        const user = await storage.getUser(member.userId);
        if (user && user.email) {
          // Send the email notification
          const success = await sendRouteDeviationEmail(
            user.email,
            user.displayName || user.username,
            tripName,
            username,
            distanceFromRoute,
            latitude,
            longitude
          );
          
          if (success) {
            emailCount++;
            console.log(`Email notification sent to ${user.email}`);
          } else {
            console.error(`Failed to send email notification to ${user.email}`);
          }
        }
      } catch (emailError) {
        console.error(`Error sending email to group member ${member.userId}:`, emailError);
      }
    }
    
    console.log(`Successfully sent email notifications to ${emailCount} group members`);
  } catch (error) {
    console.error('Error sending group deviation notifications:', error);
  }
}

/**
 * Clean location string by removing any coordinates in brackets or parentheses
 * This is the same function as in client/src/lib/utils.ts
 */
function cleanLocationString(location: string | null | undefined): string {
  // Special case: handle 'Unknown location' directly
  if (!location || location === 'Unknown location') return 'Unknown location';
  
  // Remove any coordinates in square brackets like [47.6062, -122.3321]
  let cleaned = location.replace(/\[.*?\]/g, '');
  
  // Also remove any coordinates in parentheses like (47.6062, -122.3321)
  cleaned = cleaned.replace(/\(.*?\)/g, '');
  
  // Remove any trailing commas, whitespace, or other artifacts
  cleaned = cleaned.replace(/,\s*$/, '').trim();
  
  // If we've removed everything or ended up with an empty string, return Unknown location
  if (!cleaned || cleaned.length === 0) return 'Unknown location';
  
  return cleaned;
}

/**
 * Clean location data in trip objects before sending to the client
 */
function cleanTripLocationData<T extends { startLocation?: string | null; destination?: string | null }>(
  trip: T
): T & { startLocationDisplay?: string | null; destinationDisplay?: string | null } {
  const enhancedTrip = { ...trip } as T & { 
    startLocationDisplay?: string | null; 
    destinationDisplay?: string | null 
  };
  
  if (trip.startLocation) {
    enhancedTrip.startLocationDisplay = cleanLocationString(trip.startLocation);
  }
  
  if (trip.destination) {
    enhancedTrip.destinationDisplay = cleanLocationString(trip.destination);
  }
  
  return enhancedTrip;
}

/**
 * Add display-friendly location data to itinerary items before sending to the client
 * This keeps the original location data with coordinates for map functionality
 * but adds clean versions for display purposes
 */
function cleanItineraryLocationData<T extends { fromLocation?: string | null; toLocation?: string | null }>(
  item: T
): T & { fromLocationDisplay?: string | null; toLocationDisplay?: string | null } {
  const enhancedItem = { ...item } as T & { 
    fromLocationDisplay?: string | null; 
    toLocationDisplay?: string | null 
  };
  
  if (item.fromLocation) {
    enhancedItem.fromLocationDisplay = cleanLocationString(item.fromLocation);
  }
  
  if (item.toLocation) {
    enhancedItem.toLocationDisplay = cleanLocationString(item.toLocation);
  }
  
  return enhancedItem;
}

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
 * Check if a location is on a route between two points with a given tolerance
 * @param pointLat Latitude of the point to check
 * @param pointLon Longitude of the point to check
 * @param startLat Start point latitude
 * @param startLon Start point longitude
 * @param endLat End point latitude
 * @param endLon End point longitude
 * @param toleranceKm Maximum distance from route line in kilometers
 * @returns object with isOnRoute boolean and distance from route
 */
function isLocationOnRoute(
  pointLat: number,
  pointLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  toleranceKm: number = 5.0 // Default 5km tolerance
): { isOnRoute: boolean; distanceFromRoute: number } {
  // Check for trivial case where route points are the same
  if (startLat === endLat && startLon === endLon) {
    const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
    return {
      isOnRoute: distanceToStart <= toleranceKm,
      distanceFromRoute: distanceToStart
    };
  }
  
  // Algorithm to find closest point on the line to our point
  // First, convert lat/lng to a simple 2D coordinate system for calculation
  const x = pointLat;
  const y = pointLon;
  const x1 = startLat;
  const y1 = startLon;
  const x2 = endLat;
  const y2 = endLon;

  // Calculate the line segment length squared
  const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  
  // Calculate projection of point onto line
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lenSq;
  
  // Clamp t to line segment
  t = Math.max(0, Math.min(1, t));
  
  // Calculate projection coordinates
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  // Calculate actual distance using haversine formula
  const distanceFromRoute = calculateDistance(
    pointLat,
    pointLon,
    projX,
    projY
  );
  
  return {
    isOnRoute: distanceFromRoute <= toleranceKm,
    distanceFromRoute
  };
}

/**
 * Parse coordinates from a location string
 * @param locationStr Location string that might contain coordinates in [lat, lng] or (lat, lng) format
 * @returns Object with lat and lng or null if not found/invalid
 */
function parseCoordinates(locationStr: string | null | undefined): { lat: number, lng: number } | null {
  if (!locationStr) return null;
  
  // Try the new format with square brackets [lat, lng]
  let coordsRegex = /\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\]/;
  let match = locationStr.match(coordsRegex);
  
  // If not found, try the old format with parentheses (lat, lng)
  if (!match) {
    coordsRegex = /\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/;
    match = locationStr.match(coordsRegex);
  }
  
  if (match && match.length === 3) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  
  return null;
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

/**
 * Sends email notifications to trip members when a trip status changes
 * @param tripId ID of the trip
 * @param newStatus New status of the trip
 */
async function sendTripStatusNotifications(tripId: number, newStatus: string): Promise<void> {
  try {
    console.log(`[STATUS_NOTIFICATIONS] Sending trip status notifications for Trip ${tripId}, new status: ${newStatus}`);
    
    // Get the trip details
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
    if (!trip) {
      console.error(`[STATUS_NOTIFICATIONS] Trip ${tripId} not found`);
      return;
    }
    
    // Only send notifications for status transitions to 'planning', 'confirmed', 'in-progress', or 'completed'
    if (newStatus !== 'planning' && newStatus !== 'confirmed' && newStatus !== 'in-progress' && newStatus !== 'completed') {
      console.log(`[STATUS_NOTIFICATIONS] Not sending notifications for '${newStatus}' status`);
      return;
    }
    
    // Create a list of users to notify
    let usersToNotify: { id: number; email: string; username: string; displayName: string }[] = [];
    
    // Get the trip creator using the imported schema
    const [tripCreator] = await db.select().from(users).where(eq(users.id, trip.createdBy));
    if (tripCreator) {
      usersToNotify.push(tripCreator);
    }
    
    // If the trip has a group, notify all group members
    if (trip.groupId) {
      const groupUsers = await db.select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, trip.groupId));
      
      // Add unique group members (skip duplicates if the creator is also in the group)
      for (const member of groupUsers) {
        if (!usersToNotify.some(u => u.id === member.id)) {
          usersToNotify.push(member);
        }
      }
    }
    
    // If no users to notify, log and return
    if (usersToNotify.length === 0) {
      console.log(`[STATUS_NOTIFICATIONS] No users to notify for Trip ${tripId}`);
      return;
    }
    
    // Send emails to each user
    const emailPromises = usersToNotify.map(user => {
      const { email, displayName } = user;
      const username = displayName || user.username;
      
      // Send the email with trip details
      return sendTripStatusChangeEmail(
        email,
        username,
        trip.name,
        newStatus,
        trip.startLocation,
        trip.destination,
        trip.startDate,
        trip.endDate
      );
    });
    
    // Wait for all emails to be sent
    const results = await Promise.allSettled(emailPromises);
    
    // Log the results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[STATUS_NOTIFICATIONS] Email notifications sent: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error(`[STATUS_NOTIFICATIONS] Error sending trip status notifications:`, error);
  }
}

/**
 * Checks all trips that should be in progress and updates their status
 * This is called periodically to ensure trip statuses are accurate
 */
async function checkAndUpdateTripStatuses(): Promise<void> {
  try {
    console.log('[AUTO-UPDATE] Checking trips for status updates...');
    
    let now = new Date();
    let startedCount = 0;
    let completedCount = 0;
    
    // PART 1: Check for trips that should start (planning/confirmed → in-progress)
    // Get all trips with status 'planning' or 'confirmed'
    const planningTrips = await db
      .select()
      .from(trips)
      .where(or(
        eq(trips.status, 'planning'),
        eq(trips.status, 'confirmed')
      ));
      
    // All trips that might need to be started
    const tripsToStart = planningTrips;
    
    for (const trip of tripsToStart) {
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      
      // Get the trip's itinerary items to check exact start time
      const tripItineraryItems = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, trip.id));
        
      // Initialize shouldStart to false 
      let shouldStart = false;
      
      // Only process if we have at least one itinerary item
      if (tripItineraryItems.length > 0) {
        // Sort the itinerary items by day and start time
        const sortedItems = [...tripItineraryItems].sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return (a.startTime || '').localeCompare(b.startTime || '');
        });
        
        // Get the first itinerary item's start time (earliest scheduled time)
        const firstItem = sortedItems[0];
        const dayStartTime = firstItem.startTime;
        
        if (dayStartTime) {
          // Get the current time in hours and minutes
          const currentHours = now.getHours();
          const currentMinutes = now.getMinutes();
          const currentTimeString = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
          
          // Get scheduled trip time in hours and minutes
          const [scheduledHours, scheduledMinutes] = dayStartTime.split(':').map(Number);
          
          // Compare if current time has reached or passed the scheduled time
          const hasReachedStartTime = 
            (currentHours > scheduledHours) || 
            (currentHours === scheduledHours && currentMinutes >= scheduledMinutes);
          
          // Debug time comparison
          console.log(`[AUTO-UPDATE] Trip ${trip.id} time check:`);
          console.log(`  - Current time (HH:MM): ${currentTimeString}`);
          console.log(`  - Scheduled time (HH:MM): ${dayStartTime}`);
          console.log(`  - Has reached start time? ${hasReachedStartTime}`);
          
          // Trip should start if it's the same day as trip start date AND the time has been reached
          shouldStart = (
            // Check if today's date matches the trip start date (ignoring time)
            now.toDateString() === startDate.toDateString() &&
            // Check if the current time has reached the scheduled time
            hasReachedStartTime &&
            // Make sure end date hasn't passed
            endDate > now
          );
        } else {
          // If no start time is set for itinerary items, fall back to date-only comparison
          shouldStart = (
            startDate <= now && 
            endDate > now && 
            (Math.abs(now.getTime() - startDate.getTime()) <= 24 * 60 * 60 * 1000)
          );
        }
      } else {
        // No itinerary items, just use trip date
        shouldStart = (
          startDate <= now && 
          endDate > now && 
          (Math.abs(now.getTime() - startDate.getTime()) <= 24 * 60 * 60 * 1000)
        );
      }
      
      // Verify that if a trip had its status manually changed to in-progress earlier,
      // it should stay that way (not go back to planning)
      const isAlreadyInProgress = trip.status === 'in-progress';
      
      // Debug date comparisons
      console.log(`[AUTO-UPDATE] Trip ${trip.id} (${trip.name}):`);
      console.log(`  - Start time: ${startDate.toISOString()}`);
      console.log(`  - End time: ${endDate.toISOString()}`);
      console.log(`  - Current time: ${now.toISOString()}`);
      console.log(`  - Should start? ${shouldStart}`);
      
      // Only log the isAlreadyInProgress status if it is true
      if (isAlreadyInProgress) {
        console.log(`[AUTO-UPDATE] Trip ${trip.id} is already in-progress, keeping this status`);
      }
      
      // Exclude Trip 26 from automatic status updates (as per user requirement)
      const isExcludedTrip = trip.id === 26;
      if (isExcludedTrip) {
        console.log(`[AUTO-UPDATE] Trip ${trip.id} is excluded from automatic status updates`);
      }

      // Only update status if not already in progress and should start
      if (shouldStart && !isAlreadyInProgress && !isExcludedTrip) {
        console.log(`[AUTO-UPDATE] Updating trip ${trip.id} (${trip.name}) to in-progress`);
        try {
          const [updated] = await db
            .update(trips)
            .set({ status: 'in-progress' })
            .where(eq(trips.id, trip.id))
            .returning();
          
          if (updated) {
            console.log(`[AUTO-UPDATE] Successfully updated trip ${trip.id} status to in-progress`);
            startedCount++;
            
            // Send email notifications for the status change
            await sendTripStatusNotifications(trip.id, 'in-progress');
          }
        } catch (updateError) {
          console.error(`[AUTO-UPDATE] Error updating trip ${trip.id}:`, updateError);
        }
      }
    }
    
    // PART 2: Check for trips that should complete (in-progress → completed)
    // Get actively in-progress trips
    const activeTrips = await db
      .select()
      .from(trips)
      .where(eq(trips.status, 'in-progress'));
      
    // PART 3: Check for trips that were missed (planning/confirmed → completed)
    // These are trips that have their end time in the past but never got marked as in-progress
    // This fixes the issue with Trip 39 being marked as completed at 12pm when scheduled for 4:16pm
    // Refresh now value to make sure it's accurate
    now = new Date();
    console.log(`[AUTO-UPDATE] Current time: ${now.toISOString()}`);
    
    // Get trips still in planning/confirmed status that have end dates in the past
    const missedTrips = await db
      .select()
      .from(trips)
      .where(
        and(
          or(
            eq(trips.status, 'planning'),
            eq(trips.status, 'confirmed')
          ),
          lt(trips.endDate, now)
        )
      );
    
    for (const trip of activeTrips) {
      const endDate = new Date(trip.endDate);
      
      // Exclude Trip 26 from automatic status updates (as per user requirement)
      const isExcludedTrip = trip.id === 26;
      if (isExcludedTrip) {
        console.log(`[AUTO-UPDATE] Trip ${trip.id} is excluded from automatic status updates`);
      }

      // Add a 30-minute buffer to prevent premature completion due to timezone or clock issues
      // This helps ensure trips don't end early by accident
      const bufferMs = 30 * 60 * 1000; // 30 minutes in milliseconds
      const adjustedEndTime = new Date(endDate.getTime() + bufferMs);
      
      // A trip should complete if its end time (plus buffer) has passed
      const shouldComplete = adjustedEndTime <= now && !isExcludedTrip;
      
      // Debug the buffer calculations
      console.log(`[AUTO-UPDATE] End time buffer calculation for Trip ${trip.id}:`);
      console.log(`  - Original end time: ${endDate.toISOString()}`);
      console.log(`  - Buffered end time: ${adjustedEndTime.toISOString()}`);
      console.log(`  - Buffer amount: 30 minutes (${bufferMs}ms)`);
      
      
      // Debug date comparisons with adjusted time
      console.log(`[AUTO-UPDATE] Active Trip ${trip.id} (${trip.name}):`);
      console.log(`  - Original end time: ${endDate.toISOString()}`);
      console.log(`  - Buffered end time: ${adjustedEndTime.toISOString()}`);
      console.log(`  - Current time: ${now.toISOString()}`);
      console.log(`  - Should complete? ${shouldComplete}`);
      console.log(`  - Comparison: ${adjustedEndTime.getTime() <= now.getTime() ? 'End time has passed' : 'End time is in the future'}`);
      
      if (shouldComplete) {
        console.log(`[AUTO-UPDATE] Completing trip ${trip.id} (${trip.name}) as its end time + buffer (30min) has passed`);
        console.log(`[AUTO-UPDATE] Note: buffer is only for status update, displayed end time remains ${endDate.toISOString()}`);
        try {
          const [updated] = await db
            .update(trips)
            .set({ status: 'completed' })
            .where(eq(trips.id, trip.id))
            .returning();
          
          if (updated) {
            console.log(`[AUTO-UPDATE] Successfully marked trip ${trip.id} as completed`);
            completedCount++;
            
            // Send email notifications for the status change
            await sendTripStatusNotifications(trip.id, 'completed');
          }
        } catch (updateError) {
          console.error(`[AUTO-UPDATE] Error completing trip ${trip.id}:`, updateError);
        }
      }
    }
    
    // Process missed trips (that should be marked as completed directly)
    console.log(`[AUTO-UPDATE] Found ${missedTrips.length} trips that missed the in-progress state and need to be directly completed`);
    
    for (const trip of missedTrips) {
      // Skip Trip 26 (as per user requirement)
      if (trip.id === 26) {
        console.log(`[AUTO-UPDATE] Trip ${trip.id} is excluded from automatic status updates`);
        continue;
      }
      
      const endDate = new Date(trip.endDate);
      const startDate = new Date(trip.startDate);
      
      // Debug information for missed trips
      console.log(`[AUTO-UPDATE] Missed Trip ${trip.id} (${trip.name}):`);
      console.log(`  - Status: ${trip.status}`);
      console.log(`  - Start time: ${startDate.toISOString()}`);
      console.log(`  - End time: ${endDate.toISOString()}`);
      console.log(`  - Current time: ${now.toISOString()}`);
      
      try {
        // Add a buffer of 30 minutes to the end time to be consistent with active trips
        const bufferMs = 30 * 60 * 1000; // 30 minutes
        const adjustedEndTime = new Date(endDate.getTime() + bufferMs);
        
        // Only mark as completed if the end time + buffer has passed
        if (adjustedEndTime <= now) {
          console.log(`[AUTO-UPDATE] Directly completing missed trip ${trip.id} (${trip.name})`);
          console.log(`  - End time + buffer (${bufferMs}ms) has passed`);
          
          const [updated] = await db
            .update(trips)
            .set({ status: 'completed' })
            .where(eq(trips.id, trip.id))
            .returning();
          
          if (updated) {
            console.log(`[AUTO-UPDATE] Successfully marked missed trip ${trip.id} as completed`);
            completedCount++;
            
            // Send email notifications for the status change
            await sendTripStatusNotifications(trip.id, 'completed');
          }
        } else {
          // This handles edge cases where a trip is in the past but end time + buffer hasn't passed
          console.log(`[AUTO-UPDATE] Missed trip ${trip.id} end time + buffer hasn't passed yet`);
          console.log(`  - Adjusted end time: ${adjustedEndTime.toISOString()}`);
        }
      } catch (updateError) {
        console.error(`[AUTO-UPDATE] Error completing missed trip ${trip.id}:`, updateError);
      }
    }
    
    // Final summary including both normal completion and missed trip handling
    console.log(`[AUTO-UPDATE] Completed checking trips. Started ${startedCount} trips, completed ${completedCount} trips (including ${missedTrips.length} missed trips).`);
  } catch (error) {
    console.error('[AUTO-UPDATE] Error checking for trip status updates:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up periodic check of trip statuses every 5 minutes
  setInterval(async () => {
    try {
      console.log('[SCHEDULER] Running scheduled trip status check');
      await checkAndUpdateTripStatuses();
    } catch (error) {
      console.error('[SCHEDULER] Error in scheduled trip status check:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Run an initial check when the server starts
  setTimeout(async () => {
    try {
      console.log('[STARTUP] Running initial trip status check');
      await checkAndUpdateTripStatuses();
    } catch (error) {
      console.error('[STARTUP] Error in initial trip status check:', error);
    }
  }, 10000); // 10 seconds after server start
  // Set up file upload middleware
  app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
    abortOnLimit: true,
    responseOnLimit: "File size limit has been reached"
  }));
  
  // Set up authentication routes
  setupAuth(app);
  
  // Set up bulk import routes
  setupImportRoutes(app);
  
  // Set up phone verification routes
  setupPhoneVerificationRoutes(app);
  
  // Database health check endpoint
  // Manual endpoint to check and update trip statuses (for testing purposes)
  // Public endpoint to test trip status updates (for testing purposes only)
  app.get("/api/test/check-trip-statuses", async (req, res) => {
    try {
      console.log('[TEST] Manually triggered trip status check');
      await checkAndUpdateTripStatuses();
      res.json({ success: true, message: "Trip status check completed" });
    } catch (error) {
      console.error("[TEST] Error checking trip statuses:", error);
      res.status(500).json({ success: false, error: "Failed to check trip statuses" });
    }
  });

  // Specific endpoint to update Trip 28 status (for testing purposes)
  app.post("/api/admin/trips/28/update-status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      // Force update Trip 28 to in-progress
      const [updated] = await db
        .update(trips)
        .set({ status: 'in-progress' })
        .where(eq(trips.id, 28))
        .returning();

      if (updated) {
        // Send email notifications for the status change
        await sendTripStatusNotifications(28, 'in-progress');
        
        return res.json({ 
          success: true, 
          message: "Trip 28 status updated to in-progress",
          trip: updated
        });
      } else {
        return res.status(404).json({
          success: false,
          message: "Trip 28 not found"
        });
      }
    } catch (error) {
      console.error("Error updating Trip 28 status:", error);
      res.status(500).json({ success: false, error: "Failed to update Trip 28 status" });
    }
  });

  app.post("/api/admin/trips/update-statuses", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      await checkAndUpdateTripStatuses();
      res.json({ success: true, message: "Trip status check triggered successfully" });
    } catch (error) {
      console.error("Error checking trip statuses:", error);
      res.status(500).json({ success: false, error: "Failed to check trip statuses" });
    }
  });

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
  
  // Mapbox API endpoints
  // Check if token is available
  app.get("/api/mapbox/check-token", (req, res) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    res.json({
      available: !!token
    });
  });
  
  // Email debugging endpoints - REMOVE IN PRODUCTION
  
  // Get email configuration info
  app.get("/api/debug/email-config", (req, res) => {
    const configured = !!process.env.SENDGRID_API_KEY;
    const sender = process.env.SENDGRID_VERIFIED_SENDER;
    
    res.json({
      configured,
      sender
    });
  });
  
  // Serve email debug HTML page
  app.get("/debug/email", async (req, res) => {
    try {
      // Import modules using ES module imports
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      
      const emailDebugHtmlPath = join(process.cwd(), 'email-debug.html');
      const htmlContent = await readFile(emailDebugHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error("Failed to serve email debug page:", error);
      res.status(500).json({ message: String(error) });
    }
  });
  
  // Send a test email
  app.post("/api/debug/test-email", async (req, res) => {
    try {
      // Use query param or body, with body taking precedence
      const email = req.body.email || req.query.email || (req.isAuthenticated() ? req.user.email : null);
      
      if (!email) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      const subject = req.body.subject || "TravelGroupr Test Email";
      const message = req.body.message || "This is a test email from TravelGroupr to verify email delivery is working correctly.";
      
      console.log(`[EMAIL_DEBUG] Sending test email to ${email}`);
      
      // Use the sendEmail function
      const { sendEmail } = await import('./email');
      
      const success = await sendEmail({
        to: email,
        from: process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com',
        subject,
        text: message,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #4a6ee0;">TravelGroupr Test Email</h2>
            <p>${message}</p>
            <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
            <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
              <p style="margin: 0; font-size: 12px; color: #666;">
                This is an automated message from TravelGroupr. Please do not reply to this email.
              </p>
            </div>
          </div>
        `
      });
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test email successfully sent to ${email}`);
        return res.json({ message: `Test email sent to ${email}` });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test group invitation email
  app.post("/api/debug/email/invitation", async (req, res) => {
    try {
      const { email, groupName, inviterName, isExistingUser } = req.body;
      
      if (!email || !groupName || !inviterName) {
        return res.status(400).json({ message: "Email, group name, and inviter name are required" });
      }
      
      console.log(`[EMAIL_DEBUG] Sending test ${isExistingUser ? 'existing user' : 'new user'} invitation email to ${email}`);
      
      // Use the sendGroupInvitation function
      const { sendGroupInvitation } = await import('./email');
      
      const inviteLink = `https://${req.headers.host}/invite/test/test123?email=${encodeURIComponent(email)}`;
      
      const success = await sendGroupInvitation(
        email,
        groupName,
        inviterName,
        inviteLink,
        isExistingUser
      );
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test invitation email successfully sent to ${email}`);
        return res.json({ message: `Invitation email sent to ${email}` });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test invitation email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test invitation email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test email verification
  app.post("/api/debug/email/verification", async (req, res) => {
    try {
      const { email, name } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ message: "Email and name are required" });
      }
      
      console.log(`[EMAIL_DEBUG] Sending test verification email to ${email}`);
      
      // Generate a test verification token
      const verificationToken = Math.random().toString(36).substring(2, 15);
      
      // Use the sendEmailVerification function
      const { sendEmailVerification } = await import('./email');
      
      const verificationLink = `https://${req.headers.host}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
      
      const success = await sendEmailVerification(
        email,
        name,
        verificationLink
      );
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test verification email successfully sent to ${email}`);
        return res.json({ 
          message: `Verification email sent to ${email}`,
          token: verificationToken // Include token in response for testing
        });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test verification email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test verification email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test password reset email
  app.post("/api/debug/email/reset-password", async (req, res) => {
    try {
      const { email, name } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ message: "Email and name are required" });
      }
      
      console.log(`[EMAIL_DEBUG] Sending test password reset email to ${email}`);
      
      // Generate a test reset token
      const resetToken = Math.random().toString(36).substring(2, 15);
      
      // Use the sendPasswordResetEmail function
      const { sendPasswordResetEmail } = await import('./email');
      
      const resetLink = `https://${req.headers.host}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      
      const success = await sendPasswordResetEmail(
        email,
        name,
        resetLink
      );
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test password reset email successfully sent to ${email}`);
        return res.json({ 
          message: `Password reset email sent to ${email}`,
          token: resetToken // Include token in response for testing
        });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test password reset email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test password reset email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test trip status change email
  app.post("/api/debug/email/trip-status", async (req, res) => {
    try {
      const { email, name, tripName, status } = req.body;
      
      if (!email || !name || !tripName || !status) {
        return res.status(400).json({ message: "Email, name, trip name, and status are required" });
      }
      
      console.log(`[EMAIL_DEBUG] Sending test trip status email to ${email}`);
      
      // Use the sendTripStatusChangeEmail function
      const { sendTripStatusChangeEmail } = await import('./email');
      
      const success = await sendTripStatusChangeEmail(
        email,
        name,
        tripName,
        status,
        "Seattle, WA", // Example start location
        "Portland, OR", // Example destination
        new Date(), // Example start date
        new Date(Date.now() + 86400000) // Example end date (tomorrow)
      );
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test trip status email successfully sent to ${email}`);
        return res.json({ message: `Trip status email sent to ${email}` });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test trip status email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test trip status email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test route deviation email
  app.post("/api/debug/email/route-deviation", async (req, res) => {
    try {
      const { email, name, tripName, deviatorName, distance } = req.body;
      
      if (!email || !name || !tripName || !deviatorName || !distance) {
        return res.status(400).json({ message: "Email, name, trip name, deviator name, and distance are required" });
      }
      
      console.log(`[EMAIL_DEBUG] Sending test route deviation email to ${email}`);
      
      // Use the sendRouteDeviationEmail function
      const { sendRouteDeviationEmail } = await import('./email');
      
      const success = await sendRouteDeviationEmail(
        email,
        name,
        tripName,
        deviatorName,
        parseFloat(distance),
        47.6062, // Example latitude (Seattle)
        -122.3321 // Example longitude (Seattle)
      );
      
      if (success) {
        console.log(`[EMAIL_DEBUG] Test route deviation email successfully sent to ${email}`);
        return res.json({ message: `Route deviation email sent to ${email}` });
      } else {
        console.error(`[EMAIL_DEBUG] Failed to send test route deviation email to ${email}`);
        return res.status(500).json({ message: 'Email sending failed. Check server logs for details.' });
      }
    } catch (error) {
      console.error("[EMAIL_DEBUG] Error sending test route deviation email:", error);
      return res.status(500).json({ message: "Server error", error: String(error) });
    }
  });
  
  // Test endpoint for route deviation notifications - REMOVE IN PRODUCTION
  app.get("/api/test/route-deviation", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      console.log('===== ROUTE DEVIATION TEST TRIGGERED =====');
      console.log(`User authenticated: ${req.user.username}`);
      
      // Get the active trip - using request parameter or default to 37
      const tripId = parseInt(req.query.tripId as string) || 37;
      
      // Use provided coordinates or defaults
      const testLocation = {
        latitude: parseFloat(req.query.lat as string) || 47.683210,
        longitude: parseFloat(req.query.lng as string) || -122.102622
      };
      
      console.log(`[TEST] Simulating route deviation for trip ${tripId}...`);
      console.log(`[TEST] Using coordinates: ${testLocation.latitude}, ${testLocation.longitude}`);
      
      // Get the trip
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        console.error(`[TEST] Trip ${tripId} not found`);
        return res.status(404).json({ error: "Trip not found" });
      }
      
      console.log(`[TEST] Found trip: ${trip.name} (ID: ${trip.id})`);
      
      // Get trip creator
      const creator = await storage.getUser(trip.createdBy);
      
      if (!creator) {
        console.error(`[TEST] Creator (ID: ${trip.createdBy}) not found`);
        return res.status(404).json({ error: "Trip creator not found" });
      }
      
      if (!creator.email) {
        console.error(`[TEST] Creator ${creator.username} has no email address`);
        return res.status(404).json({ error: "Trip creator email not found" });
      }
      
      console.log(`[TEST] Found creator: ${creator.username} (Email: ${creator.email})`);
      console.log(`[TEST] Sending test email to trip creator: ${creator.email}`);
      
      // Display information about SendGrid configuration
      console.log(`[TEST] SendGrid API key configured: ${!!process.env.SENDGRID_API_KEY}`);
      console.log(`[TEST] SendGrid verified sender: ${process.env.SENDGRID_VERIFIED_SENDER || 'not set'}`);
      
      // Calculate a realistic distance from route
      let distanceFromRoute = 5.2; // Default value
      
      if (trip.startLocation && trip.destination) {
        // Try to calculate a more accurate deviation distance
        try {
          const fromCoords = parseCoordinates(trip.startLocation);
          const toCoords = parseCoordinates(trip.destination);
          
          if (fromCoords && toCoords) {
            const routeCheck = isLocationOnRoute(
              testLocation.latitude,
              testLocation.longitude,
              fromCoords.lat,
              fromCoords.lng,
              toCoords.lat,
              toCoords.lng,
              10 // Large tolerance to ensure we get a distance calculation
            );
            
            if (routeCheck) {
              distanceFromRoute = routeCheck.distanceFromRoute;
              console.log(`[TEST] Calculated actual distance from route: ${distanceFromRoute.toFixed(2)}km`);
            }
          }
        } catch (calcError) {
          console.error('[TEST] Error calculating deviation distance:', calcError);
          // Continue with default distance
        }
      }
      
      // Send test email to trip creator
      try {
        const success = await sendRouteDeviationEmail(
          creator.email,
          creator.displayName || creator.username,
          trip.name,
          req.user.username,
          distanceFromRoute,
          testLocation.latitude,
          testLocation.longitude
        );
        
        if (success) {
          console.log(`[TEST] Successfully sent test deviation email to ${creator.email}`);
          return res.json({
            success: true,
            message: `Test email sent to ${creator.email}`,
            details: {
              tripName: trip.name,
              deviationDetails: {
                distanceFromRoute,
                location: testLocation
              }
            }
          });
        } else {
          console.error(`[TEST] Failed to send test deviation email to ${creator.email}`);
          return res.status(500).json({
            success: false,
            error: "Failed to send test email"
          });
        }
      } catch (emailError) {
        console.error(`[TEST] Exception during email sending:`, emailError);
        return res.status(500).json({
          success: false,
          error: "Exception during email sending",
          details: emailError instanceof Error ? emailError.message : String(emailError)
        });
      }
    } catch (error) {
      console.error("Error in test route deviation:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Endpoint to manually update trip location (for testing)
  app.post("/api/trips/:id/location", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.id);
      const { latitude, longitude } = req.body;
      
      if (isNaN(tripId) || isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: "Invalid trip ID or coordinates" });
      }
      
      console.log(`[LOCATION_UPDATE] User ${req.user.username} is updating trip ${tripId} location to ${latitude}, ${longitude}`);
      
      // Check if user has access to this trip
      const accessLevel = await checkTripAccess(req, res, () => {}, tripId);
      if (!accessLevel) {
        return; // Response already sent by checkTripAccess
      }
      
      // Get current trip data
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      // Calculate distance traveled since last update (if there was one)
      let distanceIncrement = 0;
      if (trip.currentLatitude !== null && trip.currentLongitude !== null) {
        distanceIncrement = calculateDistance(
          trip.currentLatitude,
          trip.currentLongitude,
          latitude,
          longitude
        );
      }
      
      // Calculate cumulative distance traveled
      const distanceTraveled = (trip.distanceTraveled || 0) + distanceIncrement;
      
      // Update the trip with the new location
      const updatedTrip = await storage.updateTrip(tripId, {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
        distanceTraveled
      });
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to update trip location" });
      }
      
      // Extract route coordinates for deviation detection
      let isDeviation = false;
      let deviationDistance = 0;
      
      if (trip.startLocation && trip.destination) {
        const fromCoords = parseCoordinates(trip.startLocation);
        const toCoords = parseCoordinates(trip.destination);
        
        if (fromCoords && toCoords) {
          const routeCheck = isLocationOnRoute(
            latitude,
            longitude,
            fromCoords.lat,
            fromCoords.lng,
            toCoords.lat,
            toCoords.lng,
            0.1 // 100m tolerance threshold
          );
          
          if (routeCheck) {
            isDeviation = !routeCheck.isOnRoute;
            deviationDistance = routeCheck.distanceFromRoute;
            
            console.log(`[LOCATION_UPDATE] Route check result:`, 
              { isDeviation, distance: deviationDistance.toFixed(2) + 'km' });
              
            // If this is a significant deviation, notify
            if (isDeviation && deviationDistance > 0.2) { // 200m threshold
              console.log(`[LOCATION_UPDATE] Significant deviation detected (${deviationDistance.toFixed(2)}km)`);
              
              // Get trip creator
              const creator = await storage.getUser(trip.createdBy);
              
              if (creator && creator.email) {
                // Send deviation notification
                sendRouteDeviationEmail(
                  creator.email,
                  creator.displayName || creator.username,
                  trip.name,
                  req.user.username,
                  deviationDistance,
                  latitude,
                  longitude
                ).then(success => {
                  console.log(`[LOCATION_UPDATE] Deviation email ${success ? 'sent' : 'failed'}`);
                }).catch(err => {
                  console.error('[LOCATION_UPDATE] Error sending deviation email:', err);
                });
              }
            }
          }
        }
      }
      
      // Broadcast the location update to all connected clients
      const updateMessage = {
        type: 'tripLocationUpdate',
        tripId,
        data: {
          latitude,
          longitude,
          timestamp: new Date().toISOString(),
          distanceTraveled,
          isDeviation,
          deviationDistance: isDeviation ? deviationDistance : 0
        }
      };
      
      // Send broadcast to connected WebSocket clients
      if (trip.groupId) {
        // Broadcast to all users in the group
        wss.clients.forEach((client: WebSocket & { userId?: number }) => {
          if (client.readyState === WebSocket.OPEN && client.userId) {
            // Check group membership from our tracked connections
            const userIsInGroup = Array.isArray(connectedUserGroups) && connectedUserGroups.some((ug: any) => 
              ug.groupId === trip.groupId && ug.userId === client.userId
            );
            
            if (userIsInGroup) {
              client.send(JSON.stringify(updateMessage));
            }
          }
        });
      } else {
        // Just send to the trip creator
        wss.clients.forEach((client: WebSocket & { userId?: number }) => {
          if (client.readyState === WebSocket.OPEN && client.userId === trip.createdBy) {
            client.send(JSON.stringify(updateMessage));
          }
        });
      }
      
      // Return the updated trip data
      res.json({
        success: true,
        trip: updatedTrip,
        locationDetails: {
          latitude,
          longitude,
          distanceIncrement,
          distanceTraveled,
          isDeviation,
          deviationDistance: isDeviation ? deviationDistance : 0
        }
      });
    } catch (error) {
      console.error("Error updating trip location:", error);
      res.status(500).json({
        error: "Failed to update trip location",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Mapbox directions API proxy to avoid CORS issues
  app.get("/api/mapbox/directions", async (req, res) => {
    try {
      // Use the environment variable for the token instead of passing it from the client
      // This is more secure and avoids exposing the token in browser network requests
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      const { start, end } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      console.log(`[MAPBOX] Token availability: ${token ? 'YES' : 'NO'}`);
      
      if (!token) {
        console.warn("MAPBOX_ACCESS_TOKEN not found in environment");
        return res.status(500).json({ error: "Mapbox token not configured on server" });
      }
      
      // Add more options for a better route calculation
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start};${end}?geometries=geojson&overview=full&steps=true&access_token=${token}`;
      
      console.log(`[MAPBOX] Fetching route from ${start} to ${end}`);
      console.log(`[MAPBOX] Full request URL: ${url.replace(token, 'API_KEY_HIDDEN')}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MAPBOX] Error response: ${response.status} - ${errorText}`);
        return res.status(response.status).json({ 
          error: "Mapbox API error", 
          details: errorText,
          message: "Not Authorized" // This will trigger fallback in the client
        });
      }
      
      const data = await response.json();
      
      console.log('[MAPBOX] Response data:', JSON.stringify(data).substring(0, 500) + '...');
      
      if (!data || typeof data !== 'object' || !Array.isArray(data.routes) || data.routes.length === 0) {
        console.warn('[MAPBOX] No routes found in response');
        return res.status(404).json({ error: "No route found" });
      }
      
      // Get the first route safely
      const route = data.routes[0];
      
      // Debug route structure
      console.log('[MAPBOX] Route data structure:', {
        hasGeometry: !!(route && route.geometry),
        geometryType: route?.geometry?.type,
        coordinatesCount: route?.geometry?.coordinates?.length,
        hasDistance: typeof route?.distance === 'number',
        hasDuration: typeof route?.duration === 'number'
      });
      
      // Return only what's needed to reduce response size and ensure properly typed data
      const responseData = {
        routes: Array.isArray(data.routes) ? data.routes.map((routeItem: any) => {
          if (!routeItem) return null;
          return {
            geometry: routeItem.geometry || null,
            duration: typeof routeItem.duration === 'number' ? routeItem.duration : 0,
            distance: typeof routeItem.distance === 'number' ? routeItem.distance : 0,
            steps: Array.isArray(routeItem.legs) && routeItem.legs[0]?.steps ? routeItem.legs[0].steps : []
          };
        }).filter(Boolean) : []
      };
      
      res.json(responseData);
    } catch (error) {
      console.error("Error proxying Mapbox request:", error);
      res.status(500).json({ error: "Error fetching directions from Mapbox" });
    }
  });
  
  // Users
  app.get("/api/users", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // In a production app, we might want to implement pagination here
      // For now, we'll just return all users with sensitive fields removed
      const usersList = await db.select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        createdAt: users.createdAt,
        licenseNumber: users.licenseNumber,
        licenseState: users.licenseState,
        licenseExpiry: users.licenseExpiry,
        isEligibleDriver: users.isEligibleDriver,
      }).from(users);
      
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
      const result = await db.update(users)
        .set({
          licenseNumber,
          licenseState,
          licenseExpiry: new Date(licenseExpiry),
          isEligibleDriver: isEligibleDriver === undefined ? true : !!isEligibleDriver,
        })
        .where(eq(users.id, userId))
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
      const result = await db.update(users)
        .set({ isEligibleDriver: !!isEligibleDriver })
        .where(eq(users.id, userId))
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
      
      // Get the user being added
      const addedUser = await storage.getUser(validatedData.userId);
      if (!addedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Add user to group
      const member = await storage.addUserToGroup(validatedData);
      
      // Send email notification to the added user
      if (addedUser.email) {
        try {
          const inviter = req.user;
          // Create a direct link to the group
          const protocol = req.headers['x-forwarded-proto'] || req.protocol;
          const host = req.headers.host || 'localhost:5000';
          const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
          
          console.log("Using base URL for group link:", baseUrl);
          const groupLink = `${baseUrl}/groups/${groupId}`;
          
          await sendGroupInvitation(
            addedUser.email,
            group.name,
            inviter.displayName || inviter.username,
            groupLink,
            true // Mark as existing user
          );
          
          console.log(`Email notification sent to ${addedUser.email} about being added to group ${group.name}`);
        } catch (emailError) {
          // Log but don't fail if email sending fails
          console.error("Failed to send email notification:", emailError);
        }
      }
      
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
    console.log("[INVITE] Received invitation request:", {
      endpoint: `/api/groups/${req.params.id}/invite`,
      method: "POST",
      body: req.body,
      user: req.user?.id,
      headers: req.headers
    });
    
    try {
      if (!req.isAuthenticated()) {
        console.log("[INVITE] Rejecting - User not authenticated");
        return res.sendStatus(401);
      }
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        console.log(`[INVITE] Rejecting - Group ${groupId} not found`);
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is an admin of the group
      const members = await storage.getGroupMembers(groupId);
      console.log(`[INVITE] Group ${groupId} members:`, members);
      
      const isAdmin = members.some(
        member => member.userId === req.user.id && member.role === "admin"
      );
      
      console.log(`[INVITE] User ${req.user.id} admin status for group ${groupId}:`, isAdmin);
      
      if (!isAdmin) {
        console.log(`[INVITE] Rejecting - User ${req.user.id} is not an admin of group ${groupId}`);
        return res.status(403).json({ message: "Only group admins can invite members" });
      }
      
      // Validate request data
      const inviteSchema = z.object({
        email: z.string().email("Invalid email address"),
        phoneNumber: z.string().optional(),
        role: z.enum(["member", "admin"]).default("member"),
      });
      
      console.log("[INVITE] Validating request body:", req.body);
      
      try {
        const validatedData = inviteSchema.parse(req.body);
        console.log("[INVITE] Request data validation passed:", validatedData);
      
        // Generate a unique token for this invitation
        const token = crypto.randomBytes(32).toString('hex');
      
      // In a production app, we would store this token in the database
      // For now, we'll just send the email with a registration link that includes the token
      
      // Create an invite link
      // Determine base URL from the request or fallback to environment variable
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers.host || 'localhost:5000';
      const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
      
      console.log("Using base URL for invitation:", baseUrl);
      // Create invite link with cleaner URL format that will be redirected to auth page
      const inviteLink = `${baseUrl}/invite/${groupId}/${token}?email=${encodeURIComponent(validatedData.email)}`;
      
      // Send invitation email
      const inviter = req.user;
      console.log(`[INVITE] Attempting to send invitation email to ${validatedData.email} for group ${group.name}`);
      console.log(`[INVITE] Invite link: ${inviteLink}`);
      
      // Check if the user already exists in the system
      const existingUser = await storage.getUserByUsername(validatedData.email);
      const isExistingUser = !!existingUser;
      
      console.log(`[INVITE] User ${validatedData.email} exists in system: ${isExistingUser}`);
      
      const success = await sendGroupInvitation(
        validatedData.email,
        group.name,
        inviter.displayName || inviter.username,
        inviteLink,
        isExistingUser
      );
      
      console.log(`Email invitation result: ${success ? 'Success' : 'Failed'}`);
      
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
    } catch (validationError) {
      console.error("[INVITE] Validation error:", validationError);
      
      if (validationError instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      
      throw validationError;
    }
  } catch (err) {
    console.error("Error sending invitation:", err);
    next(err);
  }
  });

  // Trips
  app.post("/api/trips", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      console.log("Creating trip with dates:", {
        startDate: req.body.startDate,
        endDate: req.body.endDate
      });
      
      // Get current time plus 5 minutes for validation
      const now = new Date();
      const validationTime = new Date(now.getTime() + 5 * 60 * 1000);
      
      // STEP 1: Basic validation checks
      if (!req.body.startDate || !req.body.endDate) {
        return res.status(400).json({
          error: "Missing date values",
          details: "Both start date and end date are required"
        });
      }
      
      // STEP 2: Parse dates and check if they're valid
      let startDate, endDate;
      
      try {
        startDate = new Date(req.body.startDate);
        endDate = new Date(req.body.endDate);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({
            error: "Invalid date format",
            details: "The dates provided could not be parsed as valid dates"
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: "Date parsing error",
          details: "Could not convert the provided values to dates"
        });
      }
      
      // Log actual date values for debugging
      console.log("[DATE CHECK]\nValidating dates:", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        now: now.toISOString(),
        validationTime: validationTime.toISOString(),
      });
      console.log("Validation results:", {
        isStartInPast: startDate < now,
        isEndInPast: endDate < now,
        isEndAfterStart: endDate >= startDate
      });
      
      // Add a small buffer (10 seconds) to account for network delays and server processing time
      const bufferTime = new Date(now.getTime() - 10 * 1000); // 10 seconds in the past
      
      // STEP 3: For trip creation, use relaxed validation for dates
      // Allow current time for trips to start immediately
      // Use the buffer time to allow for slight delays in form submission
      
      // Special handling for same-day trips - check if the startDate is today
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isStartingToday = startDay.getTime() === today.getTime();
      
      // If the trip is starting today, allow it even if the exact time is in the past
      // This handles the case where the form was loaded at one time, but submitted later
      if (startDate < bufferTime && !isStartingToday) {
        console.log("[DATE CHECK FAILED] Start date is in the past:", 
                    `start: ${startDate.toISOString()}, buffer: ${bufferTime.toISOString()}`);
        return res.status(400).json({
          error: "Invalid start date",
          details: "Start date cannot be in the past"
        });
      }
      
      // If the trip is starting today and the time is in the past, update it to now + 1 min
      if (isStartingToday && startDate < now) {
        console.log("[DATE CHECK] Adjusting today's start time to now:", 
                   `original: ${startDate.toISOString()}, adjusted: ${new Date(now.getTime() + 60000).toISOString()}`);
        startDate = new Date(now.getTime() + 60000); // Set to 1 minute from now
      }
      
      // STEP 4: Validate end date is not in the past
      if (endDate < bufferTime && !isStartingToday) {
        console.log("[DATE CHECK FAILED] End date is in the past:", 
                    `end: ${endDate.toISOString()}, buffer: ${bufferTime.toISOString()}`);
        return res.status(400).json({
          error: "Invalid end date",
          details: "End date cannot be in the past"
        });
      }
      
      // If the trip is starting today and the end time is in the past, update it
      // End date should be at least after the start date
      if (isStartingToday && endDate < now) {
        // Make sure end date is after start date
        const newEndDate = new Date(Math.max(startDate.getTime() + 3600000, now.getTime() + 3600000)); // 1 hour later than start or now
        console.log("[DATE CHECK] Adjusting today's end time:", 
                   `original: ${endDate.toISOString()}, adjusted: ${newEndDate.toISOString()}`);
        endDate = newEndDate;
      }
      
      // STEP 5: Validate end date is not before start date
      if (endDate < startDate) {
        console.log("[DATE CHECK FAILED] End date is before start date");
        console.log(`Start: ${startDate.toISOString()}`);
        console.log(`End: ${endDate.toISOString()}`);
        
        return res.status(400).json({
          error: "Invalid date range",
          details: "End date cannot be before start date"
        });
      }
      
      // If we reached here, dates are valid
      console.log("[DATE CHECK PASSED] All date validations passed");
      
      // Process the dates into a standard format
      // Check if we need to auto-update status to "in-progress"
      // If start date is today and current time is within the trip time range, set as in-progress
      let tripStatus = req.body.status;
      const isStartTimeNow = isStartingToday && startDate <= now && endDate > now;
      
      if (isStartTimeNow && tripStatus === "planning" || tripStatus === "confirmed") {
        console.log("[STATUS AUTO-UPDATE] Setting trip status to in-progress because start time is now");
        tripStatus = "in-progress";
      }

      const tripData = {
        ...req.body,
        startDate: startDate,  // Use the parsed Date object
        endDate: endDate,      // Use the parsed Date object
        status: tripStatus,    // Use the potentially updated status
        createdBy: req.user.id
      };
      
      // Create the trip
      const trip = await storage.createTrip(tripData);
      res.status(201).json(trip);
      
    } catch (err) {
      console.error("Trip creation error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      next(err);
    }
  });

  app.get("/api/trips", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Get base trip data
      const trips = await storage.getTripsByUserId(req.user.id);
      
      // Print all trip IDs and statuses for debugging
      console.log("ALL TRIPS FROM DB:", trips.map(t => ({ id: t.id, status: t.status })));
      console.log("IN-PROGRESS TRIPS:", trips.filter(t => t.status === 'in-progress').map(t => t.id));
      
      // Enhance each trip with access level information and clean location data
      const tripsWithAccessLevels = trips.map(trip => {
        // If user is the creator, they're the owner
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        // Clean location data before sending to client
        const cleanedTrip = cleanTripLocationData(trip);
        
        return {
          ...cleanedTrip,
          _accessLevel: isOwner ? 'owner' : 'member'
        };
      });
      
      console.log(`Returning ${tripsWithAccessLevels.length} trips with access levels`);
      console.log("ALL TRIP IDS BEING RETURNED:", tripsWithAccessLevels.map(t => t.id));
      
      res.json(tripsWithAccessLevels);
    } catch (err) {
      console.error("Error fetching trips list:", err);
      next(err);
    }
  });
  
  // Get active trips (planning or in-progress) for the current user
  app.get("/api/trips/active", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Get base trip data
      const trips = await storage.getTripsByUserId(req.user.id);
      
      // Debug logs for trip statuses
      console.log("ALL TRIPS FROM ACTIVE API:", trips.map(t => ({ id: t.id, status: t.status })));
      
      // Filter to include both planning and in-progress trips
      const activeTrips = trips.filter(trip => 
        trip.status === 'in-progress' || trip.status === 'planning'
      );
      console.log("FILTERED ACTIVE TRIPS:", activeTrips.map(t => ({ id: t.id, status: t.status })));
      
      // Enhance each trip with access level information and clean location data
      const activeTripsWithAccessLevels = activeTrips.map(trip => {
        // If user is the creator, they're the owner
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        // Clean location data before sending to client
        const cleanedTrip = cleanTripLocationData(trip);
        
        return {
          ...cleanedTrip,
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

  // Support both PUT and PATCH for trip updates
  const handleTripUpdate = async (req: Request, res: Response, next: NextFunction, method: string) => {
    try {
      console.log(`\n==== ${method} /api/trips/:id - EDIT REQUEST STARTED ====`);
      console.log(`Request body:`, JSON.stringify(req.body));
      
      if (!req.isAuthenticated()) {
        console.log(`${method} /api/trips/:id - 401 Unauthorized - Not authenticated`);
        return res.sendStatus(401);
      }
      
      const tripId = parseInt(req.params.id);
      console.log(`Editing trip ID: ${tripId}`);
      console.log(`User making request: ${req.user?.id} (${typeof req.user?.id}), Username: ${req.user?.username}`);
      
      // VALIDATE DATES FIRST if they're being updated
      if (req.body.startDate || req.body.endDate) {
        // Get current time plus 5 minutes for validation
        const now = new Date();
        const validationTime = new Date(now.getTime() + 5 * 60 * 1000);
        
        let startDate = req.body.startDate ? new Date(req.body.startDate) : null;
        let endDate = req.body.endDate ? new Date(req.body.endDate) : null;
        
        // Log date validation attempt
        console.log("[TRIP_EDIT] Date validation check:", {
          startDateProvided: !!req.body.startDate,
          endDateProvided: !!req.body.endDate,
          startDateParsed: startDate ? startDate.toISOString() : null,
          endDateParsed: endDate ? endDate.toISOString() : null
        });
        
        // Get existing trip to check if we're editing a trip that has already started
        const existingTrip = await storage.getTrip(tripId);
        if (!existingTrip) {
          return res.status(404).json({ error: "Trip not found" });
        }
        
        console.log("[TRIP_EDIT] Existing trip dates:", {
          tripId,
          startDate: existingTrip.startDate,
          endDate: existingTrip.endDate
        });
        
        // Validate dates only if they were provided in the update
        if (startDate) {
          if (isNaN(startDate.getTime())) {
            return res.status(400).json({
              error: "Invalid start date format",
              details: "The start date provided could not be parsed"
            });
          }
          
          // For editing existing trips, we'll be more relaxed with date validation:
          // 1. If the trip has already started (existing start date is in the past),
          //    we don't validate whether the new date is in the future
          // 2. If the trip is scheduled for today, allow it
          // 3. If the trip is for the future (not today), use a more relaxed validation
          const existingStartDate = new Date(existingTrip.startDate);
          const tripAlreadyStarted = existingStartDate <= now;
          
          // Check if the start date is today
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const isStartingToday = startDay.getTime() === today.getTime();
          
          if (!tripAlreadyStarted && !isStartingToday && startDate < now) {
            console.log("[TRIP_EDIT] Start date validation failed: date is in the past");
            return res.status(400).json({
              error: "Invalid start date",
              details: "Start date cannot be in the past"
            });
          }
        }
        
        if (endDate) {
          if (isNaN(endDate.getTime())) {
            return res.status(400).json({
              error: "Invalid end date format",
              details: "The end date provided could not be parsed"
            });
          }
          
          // For editing the end date, we'll allow setting it to a past date only if 
          // the trip has already started or if it's for today
          const existingStartDate = new Date(existingTrip.startDate);
          const tripAlreadyStarted = existingStartDate <= now;
          
          // Check if the end date is today
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const isEndingToday = endDay.getTime() === today.getTime();
          
          // If the trip hasn't started, and the end date is not today, and it's in the past
          if (!tripAlreadyStarted && !isEndingToday && endDate < now) {
            console.log("[TRIP_EDIT] End date validation failed: date is in the past");
            return res.status(400).json({
              error: "Invalid end date",
              details: "End date cannot be in the past"
            });
          }
        }
        
        // If both dates are provided, we can check their relationship
        if (startDate && endDate && endDate < startDate) {
          console.log("[TRIP_EDIT] Date validation failed: end date before start date");
          return res.status(400).json({
            error: "Invalid date range",
            details: "End date cannot be before start date"
          });
        }
        
        // If only one date is provided, we need to check against the existing trip
        if ((startDate && !endDate) || (!startDate && endDate)) {
          // Now we have both dates to compare
          const fullStartDate = startDate || new Date(existingTrip.startDate);
          const fullEndDate = endDate || new Date(existingTrip.endDate);
          
          console.log("[TRIP_EDIT] Comparing dates:", {
            startDate: fullStartDate.toISOString(),
            endDate: fullEndDate.toISOString(), 
            isValid: fullEndDate >= fullStartDate
          });
          
          if (fullEndDate < fullStartDate) {
            console.log("[TRIP_EDIT] Date validation failed: derived end date before start date");
            return res.status(400).json({
              error: "Invalid date range",
              details: "End date cannot be before start date"
            });
          }
        }
      }
      
      // Add special handling for itinerary items if present
      if (req.body.itineraryItems && Array.isArray(req.body.itineraryItems)) {
        console.log(`[TRIP_EDIT] Trip update includes ${req.body.itineraryItems.length} itinerary items`);
        
        // Log all itinerary items for debugging
        req.body.itineraryItems.forEach((item: any, index: number) => {
          console.log(`[TRIP_EDIT] Itinerary item ${index + 1}:`, 
                      `day=${item.day}, title=${item.title}, ` +
                      `fromLocation=${item.fromLocation || "NULL"}, ` + 
                      `toLocation=${item.toLocation || "NULL"}`);
          
          // Make sure locations are never null/undefined
          if (!item.fromLocation) {
            console.log(`[TRIP_EDIT] Setting default fromLocation for item ${index + 1}`);
            item.fromLocation = req.body.startLocation || "Unknown location";
          }
          
          if (!item.toLocation) {
            console.log(`[TRIP_EDIT] Setting default toLocation for item ${index + 1}`);
            item.toLocation = req.body.destination || "Unknown location";
          }
        });
      }
      
      // Check if the user has access using our helper function with improved logging
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_EDIT] ");
      
      // Owner level access can edit all fields, member level can edit certain fields
      if (accessLevel === null) {
        return; // Response already sent by checkTripAccess
      }
      
      if (accessLevel === 'member') {
        // For members, we'll allow all edits for now to make it work
        // This can be restricted later if needed
        console.log("Authorization check passed - User is a member of the trip's group");
      } else if (accessLevel === 'owner') {
        console.log("Authorization check passed - User is the creator of this trip");
      } else {
        // This shouldn't happen normally, but handle just in case
        console.log(`EDIT DENIED: User has unknown access level: ${accessLevel}`);
        return res.status(403).json({ 
          message: "You don't have permission to edit this trip" 
        });
      }
      
      try {
        // Get the existing trip to check current status and dates
        const existingTrip = await storage.getTrip(tripId);
        if (!existingTrip) {
          return res.status(404).json({ error: "Trip not found" });
        }
        
        // Create a modified copy of the input data with properly handled dates
        const processedData = { ...req.body };
        
        // Check if we need to auto-update status to "in-progress"
        const now = new Date();
        const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date(existingTrip.startDate);
        const endDate = req.body.endDate ? new Date(req.body.endDate) : new Date(existingTrip.endDate);
        
        // Check if today is the trip start date
        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isStartingToday = startDay.getTime() === today.getTime();
        
        // If the trip should start now (it's within the time window), auto-set to in-progress
        const isStartTimeNow = isStartingToday && startDate <= now && endDate > now;
        
        // Check if status update is needed
        if (isStartTimeNow && 
           (existingTrip.status === "planning" || existingTrip.status === "confirmed") &&
           req.body.status !== "completed" && req.body.status !== "cancelled") {
          console.log("[STATUS AUTO-UPDATE] Setting trip status to in-progress because start time is now");
          processedData.status = "in-progress";
        }
        
        // Handle timezone issues for dates
        if (processedData.startDate) {
          // First create a date object from the input
          let dateObj = new Date(processedData.startDate);
          
          // If the date string appears to be a date without time (e.g., "2025-05-01")
          // we need to adjust it to noon UTC to avoid timezone issues
          if (typeof processedData.startDate === 'string' && 
              (processedData.startDate.length === 10 || processedData.startDate.includes('00:00:00'))) {
            // Extract year, month, day from the string and create a UTC date at noon
            const parts = processedData.startDate.split(/[^0-9]/);
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
            const day = parseInt(parts[2]);
            
            // Create date at noon UTC to avoid timezone issues
            dateObj = new Date(Date.UTC(year, month, day, 12, 0, 0));
            console.log("Adjusted startDate to noon UTC:", dateObj);
          }
          
          processedData.startDate = dateObj;
          console.log("StartDate type:", typeof processedData.startDate);
          console.log("StartDate is Date?", processedData.startDate instanceof Date);
          console.log("StartDate value:", processedData.startDate);
        }
        
        if (processedData.endDate) {
          // First create a date object from the input
          let dateObj = new Date(processedData.endDate);
          
          // If the date string appears to be a date without time (e.g., "2025-05-01")
          // we need to adjust it to noon UTC to avoid timezone issues
          if (typeof processedData.endDate === 'string' && 
              (processedData.endDate.length === 10 || processedData.endDate.includes('00:00:00'))) {
            // Extract year, month, day from the string and create a UTC date at noon
            const parts = processedData.endDate.split(/[^0-9]/);
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
            const day = parseInt(parts[2]);
            
            // Create date at noon UTC to avoid timezone issues
            dateObj = new Date(Date.UTC(year, month, day, 12, 0, 0));
            console.log("Adjusted endDate to noon UTC:", dateObj);
          }
          
          processedData.endDate = dateObj;
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
          createdAt: z.date().optional(),
          isMultiStop: z.boolean().optional(),
          isRecurring: z.boolean().optional(),
          recurrencePattern: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          distanceTraveled: z.number().nullable().optional()
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
        
        // Get the trip's current data to check for status changes
        const currentTrip = await storage.getTrip(tripId);
        const originalStatus = currentTrip?.status;
        
        // Update the trip
        const updatedTrip = await storage.updateTrip(tripId, validatedData);
        if (!updatedTrip) {
          console.error("Trip update failed - not found or database error");
          return res.status(404).json({ message: "Trip update failed - trip not found" });
        }
        
        console.log("Trip updated successfully:", updatedTrip);
        
        // Check if status has changed and send notifications if needed
        if (validatedData.status && originalStatus !== validatedData.status) {
          console.log(`[TRIP_EDIT] Status changed from ${originalStatus} to ${validatedData.status} - sending notifications`);
          await sendTripStatusNotifications(tripId, validatedData.status);
        }
        
        // Handle itinerary items if present in the request
        if (req.body.itineraryItems && Array.isArray(req.body.itineraryItems)) {
          console.log(`[TRIP_EDIT] Processing ${req.body.itineraryItems.length} itinerary items after trip update`);
          
          try {
            // Get existing itinerary items
            const existingItems = await storage.getItineraryItemsByTripId(tripId);
            console.log(`[TRIP_EDIT] Found ${existingItems.length} existing itinerary items`);
            
            // Keep track of itinerary item IDs in the request
            const requestItemIds = new Set();
            
            console.log("[TRIP_EDIT] Tracking which itinerary items are in the request to preserve");
            
            // Dump all item information for debugging
            console.log(`[TRIP_EDIT] req.body.itineraryItems contents:`, 
                JSON.stringify(req.body.itineraryItems, null, 2));
                
            // For each item in the request
            for (const item of req.body.itineraryItems) {
              console.log(`[TRIP_EDIT] Processing itinerary item: ${JSON.stringify(item)}`);
              console.log(`[TRIP_EDIT] Item ID: ${item.id || 'none'}, Day: ${item.day}, Title: ${item.title}`);
              
              // Ensure the item has the necessary properties
              if (!item.day) {
                console.warn("[TRIP_EDIT] Skipping item without day:", item);
                continue;
              }
              
              // Prepare data for create/update
              const itemData = {
                ...item,
                tripId,
                createdBy: req.user!.id,
                // Ensure locations are never empty
                fromLocation: item.fromLocation || updatedTrip.startLocation || "Unknown location",
                toLocation: item.toLocation || updatedTrip.destination || "Unknown location"
              };
              
              // If the item has an ID, it's an existing item - update it
              if (item.id) {
                // Add to the set of IDs in the request - ensure it's stored as a number
                const numericId = typeof item.id === 'string' ? parseInt(item.id) : item.id;
                console.log(`[TRIP_EDIT] Adding item ID to tracking set: ${numericId} (converted from ${item.id}, type: ${typeof item.id})`);
                requestItemIds.add(numericId);
                
                // Find the existing item - ensure type compatibility by casting both to numbers
                const itemId = typeof item.id === 'string' ? parseInt(item.id) : item.id;
                console.log(`[TRIP_EDIT] Looking for existing item with ID: ${itemId} (type: ${typeof itemId})`);
                
                const existingItem = existingItems.find(existing => {
                  const existingId = existing.id;
                  console.log(`[TRIP_EDIT] Comparing with existing ID: ${existingId} (type: ${typeof existingId})`);
                  return existingId === itemId;
                });
                
                if (existingItem) {
                  console.log(`[TRIP_EDIT] Updating existing itinerary item ${itemId}`);
                  // Use the numeric ID when updating to ensure type consistency
                  const updatedItem = await storage.updateItineraryItem(itemId, itemData);
                  console.log(`[TRIP_EDIT] Updated item: ${updatedItem ? 'success' : 'failed'}`);
                } else {
                  console.warn(`[TRIP_EDIT] Item with ID ${itemId} not found, creating new`);
                  const newItem = await storage.createItineraryItem(itemData);
                  console.log(`[TRIP_EDIT] Created new item: ${newItem.id}`);
                }
              }
              // Otherwise it's a new item - create it
              else {
                console.log(`[TRIP_EDIT] Creating new itinerary item`);
                const newItem = await storage.createItineraryItem(itemData);
                console.log(`[TRIP_EDIT] Created new item: ${newItem.id}`);
                
                // Add the new ID to our set
                if (newItem && newItem.id) {
                  requestItemIds.add(newItem.id);
                }
              }
            }
            
            // Log the current state of requestItemIds
            console.log(`[TRIP_EDIT] requestItemIds has ${requestItemIds.size} IDs:`, Array.from(requestItemIds));
            
            // Delete any itinerary items that weren't included in the request
            // This handles the case where stops are removed from the form
            console.log(`[TRIP_EDIT] Checking ${existingItems.length} existing items against request IDs`);
            
            // Convert the Set to an array for easier comparisons
            const requestItemIdsArray = Array.from(requestItemIds).map(id => typeof id === 'string' ? parseInt(id) : id);
            console.log('[TRIP_EDIT] requestItemIdsArray (as numbers):', requestItemIdsArray);
            
            for (const existingItem of existingItems) {
              const existingId = existingItem.id;
              const isIncluded = requestItemIdsArray.includes(existingId);
              console.log(`[TRIP_EDIT] Checking existing item ${existingId} (type: ${typeof existingId}) - included in request? ${isIncluded}`);
              
              if (!isIncluded) {
                console.log(`[TRIP_EDIT] Deleting itinerary item ${existingId} as it was not in the updated request`);
                await storage.deleteItineraryItem(existingId);
              } else {
                console.log(`[TRIP_EDIT] Keeping itinerary item ${existingId} as it was included in the request`);
              }
            }
            
            console.log("[TRIP_EDIT] Finished processing all itinerary items");
          } catch (err) {
            console.error("[TRIP_EDIT] Error processing itinerary items:", err);
            // We don't want to fail the whole request if just the itinerary items fail
            // so we continue without returning an error
          }
        }
        
        // Include access level in the response like the GET endpoint does
        res.json({
          ...updatedTrip,
          _accessLevel: accessLevel // Use the actual access level we determined above
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
  };

  // Handle PUT and PATCH requests using the same handler
  app.put("/api/trips/:id", (req, res, next) => {
    console.log("PUT /api/trips/:id - Full request body:", JSON.stringify(req.body));
    handleTripUpdate(req, res, next, "PUT");
  });
  app.patch("/api/trips/:id", (req, res, next) => {
    console.log("PATCH /api/trips/:id - Full request body:", JSON.stringify(req.body));
    // Debug itinerary items specifically
    if (req.body && req.body.itineraryItems) {
      console.log(`PATCH request contains ${req.body.itineraryItems.length} itinerary items`);
      req.body.itineraryItems.forEach((item: any, index: number) => {
        console.log(`Itinerary item ${index}: fromLoc=${item.fromLocation}, toLoc=${item.toLocation}`);
      });
    }
    handleTripUpdate(req, res, next, "PATCH");
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
      
      // Check if user has access to this trip using null callback pattern
      const accessLevelPromise = checkTripAccess(req, tripId, res, ((err) => {
        if (err) {
          console.error("[SIMPLE_UPDATE] Error checking access:", err);
          res.status(500).json({ error: "Error checking access" });
        }
      }) as NextFunction, "[SIMPLE_UPDATE] ");
      
      const accessLevel = await accessLevelPromise;
      
      if (accessLevel === null) {
        console.log("Trip not found or user has no access");
        return res.status(404).json({ error: "Trip not found or you don't have access" });
      }
      
      // Allow both owners and members to update trips
      console.log(`User has ${accessLevel} access to the trip`);
      
      // Deep debug for request data
      console.log("Raw request body:", JSON.stringify(req.body));
      
      // Create a processed version of the data with proper date conversions
      const updateData: Record<string, any> = {
        name: req.body.name,
        startLocation: req.body.startLocation,
        destination: req.body.destination,
      };
      
      // Get the existing trip to check if we need to auto-update status
      const existingTrip = await storage.getTrip(tripId);
      if (!existingTrip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      // Auto-update status logic - if the trip is scheduled to start now
      const now = new Date();
      const startDate = new Date(existingTrip.startDate);
      const endDate = new Date(existingTrip.endDate);
      
      // Check if today is the trip start date
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isStartingToday = startDay.getTime() === today.getTime();
      
      // If the trip should start now (it's within the time window), auto-set to in-progress
      const isStartTimeNow = isStartingToday && startDate <= now && endDate > now;
      
      // Check if status update is needed
      if (isStartTimeNow && 
         (existingTrip.status === "planning" || existingTrip.status === "confirmed") &&
         req.body.status !== "completed" && req.body.status !== "cancelled") {
        console.log("[STATUS AUTO-UPDATE] Setting trip status to in-progress because start time is now");
        updateData.status = "in-progress";
      } else {
        // Use provided status or keep existing
        updateData.status = req.body.status || existingTrip.status;
      }
      
      // Special date handling - manually convert to Date objects with timezone fixes
      if (req.body.startDate !== undefined) {
        try {
          // Use special date for empty/null values or when our special marker is present
          if (!req.body.startDate || 
              (typeof req.body.startDate === 'string' && req.body.startDate.includes('2099'))) {
            updateData.startDate = new Date('2099-12-31T23:59:59Z');
            console.log("Using special marker date for startDate");
          } else {
            // Handle timezone issues for dates with proper UTC handling
            if (typeof req.body.startDate === 'string' && 
                (req.body.startDate.length === 10 || req.body.startDate.includes('00:00:00'))) {
              // Extract year, month, day from the string and create a UTC date at noon
              const parts = req.body.startDate.split(/[^0-9]/);
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
              const day = parseInt(parts[2]);
              
              // Create date at noon UTC to avoid timezone issues
              updateData.startDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
              console.log("Adjusted startDate to noon UTC:", updateData.startDate);
            } else {
              // Regular date with time, just convert normally
              updateData.startDate = new Date(req.body.startDate);
            }
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
            // Handle timezone issues for dates with proper UTC handling
            if (typeof req.body.endDate === 'string' && 
                (req.body.endDate.length === 10 || req.body.endDate.includes('00:00:00'))) {
              // Extract year, month, day from the string and create a UTC date at noon
              const parts = req.body.endDate.split(/[^0-9]/);
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed in JS Date
              const day = parseInt(parts[2]);
              
              // Create date at noon UTC to avoid timezone issues
              updateData.endDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
              console.log("Adjusted endDate to noon UTC:", updateData.endDate);
            } else {
              // Regular date with time, just convert normally
              updateData.endDate = new Date(req.body.endDate);
            }
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
      
      // Store the original status to check for changes
      const originalStatus = existingTrip.status;
      
      // Update the trip with the processed data
      const result = await storage.updateTrip(tripId, updateData);
      
      console.log("Update response from DB:", result);
      
      if (!result) {
        return res.status(500).json({ error: "Failed to update" });
      }
      
      // Check if status has changed and send notifications if needed
      if (updateData.status && originalStatus !== updateData.status) {
        console.log(`[SIMPLE_UPDATE] Status changed from ${originalStatus} to ${updateData.status} - sending notifications`);
        await sendTripStatusNotifications(tripId, updateData.status);
      }
      
      // Success - return the updated trip
      return res.status(200).json({
        message: "Trip updated successfully",
        trip: {
          ...result,
          _accessLevel: accessLevel  // Use the actual access level
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
      
      // Add display-friendly location data
      const enhancedTrip = cleanTripLocationData(trip);
      
      // Include access level in the response to help client determine what actions are allowed
      res.json({
        ...enhancedTrip,
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
      
      // Enhance each trip with access level information and display-friendly location data
      const tripsWithAccessLevels = trips.map(trip => {
        // If user is the creator, they're the owner, otherwise they're a member
        const isOwner = String(trip.createdBy) === String(req.user.id);
        
        // Add display-friendly location data
        const enhancedTrip = cleanTripLocationData(trip);
        
        return {
          ...enhancedTrip,
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
      
      // Add display-friendly location data to itinerary items
      const enhancedItems = items.map(item => cleanItineraryLocationData(item));
      
      res.json(enhancedItems);
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
      
      // If we have access, add display-friendly location data and return the item
      const enhancedItem = cleanItineraryLocationData(item);
      res.json(enhancedItem);
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
      
      // Add display-friendly location data to the item
      const enhancedItem = cleanItineraryLocationData(updatedItem);
      res.json(enhancedItem);
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

  // Update start location - special dedicated endpoint
  app.post("/api/trips/:id/start-location", async (req, res, next) => {
    try {
      console.log("\n==== POST /api/trips/:id/start-location - START LOCATION UPDATE ENDPOINT ====");
      
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const tripId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { startLocation } = req.body;
      
      console.log(`Updating start location for trip ${tripId} to "${startLocation}"`);
      
      // First verify this user is the trip creator
      const trip = await storage.getTrip(tripId);
      
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      if (trip.createdBy !== userId) {
        return res.status(403).json({ error: "You must be the trip creator to modify this trip" });
      }
      
      // Direct Drizzle ORM update for the startLocation field only
      const [updatedTrip] = await db
        .update(trips)
        .set({ startLocation: startLocation })
        .where(eq(trips.id, tripId))
        .returning();
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to update start location" });
      }
      
      console.log("Start location updated successfully:", updatedTrip.startLocation);
      
      return res.status(200).json({
        message: "Start location updated successfully",
        trip: {
          ...updatedTrip,
          _accessLevel: 'owner'
        }
      });
    } catch (err) {
      console.error("ERROR in start-location endpoint:", err);
      return res.status(500).json({ 
        error: "Server error", 
        message: err instanceof Error ? err.message : String(err) 
      });
    }
  });

  // Trip tracking endpoints
  app.post("/api/trips/:id/start", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const tripId = Number(req.params.id);
      const { itineraryIds } = req.body;
      
      console.log("[TRIP_START] Starting trip tracking for trip:", tripId);
      if (itineraryIds) {
        console.log("[TRIP_START] Selected itinerary items:", itineraryIds);
      }
      
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
      
      // Store selected itinerary items information if provided
      let selectedItems = [];
      if (itineraryIds && Array.isArray(itineraryIds) && itineraryIds.length > 0) {
        // Get the itinerary items selected for tracking
        const items = await storage.getItineraryItemsByTripId(tripId);
        selectedItems = items.filter(item => itineraryIds.includes(item.id));
        
        console.log("[TRIP_START] Found selected itinerary items:", 
          selectedItems.map(item => `${item.id}: ${item.title}`));
      }
      
      return res.status(200).json({ 
        message: "Trip tracking started",
        trip: {
          ...updatedTrip,
          _accessLevel: accessLevel
        },
        selectedItineraryItems: selectedItems
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
      
      console.log("[TRIP_UPDATE_LOCATION] Request body:", req.body);
      console.log("[TRIP_UPDATE_LOCATION] Latitude:", latitude, typeof latitude);
      console.log("[TRIP_UPDATE_LOCATION] Longitude:", longitude, typeof longitude);
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: "Invalid location data - latitude and longitude must be numbers" });
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
      
      // Check if the traveler is on the planned route
      let routeStatus = { isOnRoute: true, distanceFromRoute: 0 };
      let routeDeviation = null;
      
      // Extract coordinates from start and end locations if they exist
      const startCoords = parseCoordinates(trip.startLocation);
      const endCoords = parseCoordinates(trip.destination);
      
      // Only check route deviation if we have valid start and end coordinates
      if (startCoords && endCoords) {
        console.log("[TRIP_UPDATE_LOCATION] Checking route deviation with coordinates:");
        console.log(`  Start: ${JSON.stringify(startCoords)}`);
        console.log(`  End: ${JSON.stringify(endCoords)}`);
        console.log(`  Current: [${latitude}, ${longitude}]`);
        
        // Check if current location is on the route with a 10km tolerance
        routeStatus = isLocationOnRoute(
          latitude,
          longitude,
          startCoords.lat,
          startCoords.lng,
          endCoords.lat,
          endCoords.lng,
          10.0 // 10km tolerance
        );
        
        if (!routeStatus.isOnRoute) {
          console.log(`[TRIP_UPDATE_LOCATION] DEVIATION DETECTED! ${routeStatus.distanceFromRoute.toFixed(2)}km from route`);
          
          // Create a route deviation object for the response
          routeDeviation = {
            latitude,
            longitude,
            timestamp: new Date(),
            distanceFromRoute: routeStatus.distanceFromRoute,
            tripId
          };
          
          // Always send notification to trip creator - whether in a group or not
          try {
            // Get the trip creator's user information
            const creator = await storage.getUser(trip.createdBy);
            
            if (creator && creator.email) {
              console.log(`[TRIP_UPDATE_LOCATION] Sending deviation email to trip creator: ${creator.email}`);
              
              // Send notification to the trip creator
              const success = await sendRouteDeviationEmail(
                creator.email,
                creator.displayName || creator.username,
                trip.name,
                req.user.username, // Username of the person who deviated
                routeStatus.distanceFromRoute,
                latitude,
                longitude
              );
              
              if (success) {
                console.log(`[TRIP_UPDATE_LOCATION] Successfully sent deviation email to trip creator`);
              } else {
                console.error(`[TRIP_UPDATE_LOCATION] Failed to send deviation email to trip creator`);
              }
            }
            
            // Also notify all group members if trip belongs to a group
            if (trip.groupId) {
              console.log(`[TRIP_UPDATE_LOCATION] Trip belongs to group ${trip.groupId}, notifying group members`);
              
              // Send notification to all group members
              notifyGroupAboutDeviation(
                trip.groupId,
                tripId,
                trip.name,
                req.user.username, // Username of the person who deviated
                routeStatus.distanceFromRoute,
                latitude,
                longitude
              );
            }
          } catch (error) {
            console.error('[TRIP_UPDATE_LOCATION] Error sending deviation notifications:', error);
            // Don't fail the request if notification fails
          }
        } else {
          console.log(`[TRIP_UPDATE_LOCATION] Traveler is on route (${routeStatus.distanceFromRoute.toFixed(2)}km from route)`);
        }
      } else {
        console.log("[TRIP_UPDATE_LOCATION] Cannot check route deviation - missing valid start/end coordinates");
      }
      
      // Update trip with new location
      const data = {
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationUpdate: new Date(),
        distanceTraveled: distance
      };
      
      // Log the update data for debugging
      console.log("[TRIP_UPDATE_LOCATION] Location update data:", JSON.stringify(data));
      
      // Bypass the storage.updateTrip method which is having issues
      // Use a direct database update for this special case
      try {
        const [updatedResult] = await db
          .update(trips)
          .set(data)
          .where(eq(trips.id, tripId))
          .returning();
        
        if (!updatedResult) {
          return res.status(500).json({ error: "Failed to update trip location - database error" });
        }
        
        console.log("[TRIP_UPDATE_LOCATION] Successfully updated trip location");
        
        return res.status(200).json({
          message: "Trip location updated",
          trip: {
            ...updatedResult,
            _accessLevel: accessLevel
          },
          routeStatus: routeStatus ? {
            isOnRoute: routeStatus.isOnRoute,
            distanceFromRoute: routeStatus.distanceFromRoute
          } : null,
          deviation: routeDeviation ? {
            isDeviated: true,
            distanceFromRoute: routeStatus.distanceFromRoute,
            message: `You are ${routeStatus.distanceFromRoute.toFixed(2)}km away from the planned route`
          } : null
        });
      } catch (dbError) {
        console.error("[TRIP_UPDATE_LOCATION] Database error:", dbError);
        return res.status(500).json({ error: "Database error updating location" });
      }
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
      const { confirmComplete, currentItineraryStep, totalItinerarySteps } = req.body;
      
      // Check if user is the owner or member of trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[TRIP_COMPLETE] ");
      if (!accessLevel) {
        return; // Error response already sent
      }
      
      if (accessLevel !== 'owner') {
        return res.status(403).json({ error: "Only trip owners can complete trips" });
      }
      
      // Check if there are more itinerary items left
      console.log("[TRIP_COMPLETE] Current step:", currentItineraryStep, "Total steps:", totalItinerarySteps);
      
      if (
        !confirmComplete && 
        currentItineraryStep !== undefined && 
        totalItinerarySteps !== undefined && 
        currentItineraryStep < totalItinerarySteps - 1
      ) {
        return res.status(400).json({ 
          error: "There are remaining itinerary items that haven't been visited yet",
          currentStep: currentItineraryStep,
          totalSteps: totalItinerarySteps,
          requireConfirmation: true
        });
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

  // Get all messages for the current user across all groups
  app.get("/api/messages", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Get all groups the user is a member of
      const groups = await storage.getGroupsByUserId(req.user.id);
      
      if (!groups || groups.length === 0) {
        return res.json([]); // No groups, so no messages
      }
      
      // Collect all messages from all user groups
      const allMessages = [];
      
      for (const group of groups) {
        try {
          const messages = await storage.getMessagesByGroupId(group.id);
          if (messages && messages.length > 0) {
            // Add each message to our array
            allMessages.push(...messages);
          }
        } catch (err) {
          console.error(`Error fetching messages for group ${group.id}:`, err);
          // Continue with other groups even if one fails
        }
      }
      
      // Sort all messages by creation date (newest first)
      allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(allMessages);
    } catch (err) {
      console.error("Error fetching all messages:", err);
      next(err);
    }
  });

  // Messages
  app.post("/api/groups/:id/messages", async (req, res, next) => {
    try {
      console.log("Message POST request received for group:", req.params.id, "with data:", req.body);
      
      if (!req.isAuthenticated()) {
        console.log("User not authenticated for message post");
        return res.sendStatus(401);
      }
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        console.log("Group not found for message post:", groupId);
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      const members = await storage.getGroupMembers(groupId);
      const isMember = members.some(member => member.userId === req.user.id);
      console.log("Is member check for message post:", { userId: req.user.id, isMember, members });
      
      if (!isMember) {
        console.log("User is not a member of the group:", req.user.id, groupId);
        return res.status(403).json({ message: "Not a member of this group" });
      }
      
      const validatedData = insertMessageSchema.parse({
        ...req.body,
        groupId,
        userId: req.user.id
      });
      
      console.log("Creating message with data:", validatedData);
      const message = await storage.createMessage(validatedData);
      console.log("Message created successfully:", message);
      res.status(201).json(message);
    } catch (err) {
      console.error("Error posting message:", err);
      next(err);
    }
  });

  app.get("/api/groups/:id/messages", async (req, res, next) => {
    try {
      console.log("GET messages request received for group:", req.params.id);
      
      if (!req.isAuthenticated()) {
        console.log("User not authenticated for message retrieval");
        return res.sendStatus(401);
      }
      
      const groupId = parseInt(req.params.id);
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        console.log("Group not found for message retrieval:", groupId);
        return res.status(404).json({ message: "Group not found" });
      }
      
      // Check if user is a member of the group
      try {
        const members = await storage.getGroupMembers(groupId);
        const isMember = members.some(member => member.userId === req.user.id);
        console.log("Is member check for message retrieval:", { userId: req.user.id, isMember, members });
        
        if (!isMember) {
          console.log("User is not a member of the group:", req.user.id, groupId);
          return res.status(403).json({ message: "Not a member of this group" });
        }
        
        console.log("Retrieving messages for group:", groupId);
        const messages = await storage.getMessagesByGroupId(groupId);
        console.log(`Retrieved ${messages.length} messages for group ${groupId}`);
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
  
  // Direct test endpoint to see all trips (debugging only)
  app.get("/api/debug/all-trips", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get user-created trips directly
      const createdTrips = await db.select().from(trips).where(eq(trips.createdBy, req.user.id));
      console.log("Direct DB query: User-created trips:", createdTrips.map(t => t.id));
      
      // Get trips through storage method
      const storageTrips = await storage.getTripsByUserId(req.user.id);
      console.log("Storage method trips:", storageTrips.map(t => t.id));
      
      res.json({
        numberOfCreatedTrips: createdTrips.length,
        createdTripIds: createdTrips.map(t => t.id),
        numberOfStorageTrips: storageTrips.length,
        storageTripIds: storageTrips.map(t => t.id)
      });
    } catch (error) {
      console.error("Debug trips error:", error);
      res.status(500).json({ error: "Error retrieving trips" });
    }
  });

  // Trip Check-in routes
  // Get all check-ins for a trip
  app.get('/api/trips/:tripId/check-ins', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      if (isNaN(tripId)) {
        return res.status(400).json({ error: 'Invalid trip ID' });
      }

      // Verify user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[CHECKINS] ");
      if (!accessLevel) return; // Response already sent by checkTripAccess

      const checkIns = await storage.getTripCheckIns(tripId);
      res.json(checkIns);
    } catch (error) {
      next(error);
    }
  });

  // Get a specific user's check-in for a trip
  app.get('/api/trips/:tripId/check-ins/user/:userId', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      const userId = parseInt(req.params.userId);
      
      if (isNaN(tripId) || isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid trip or user ID' });
      }

      // Verify user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[CHECKIN_USER] ");
      if (!accessLevel) return; // Response already sent by checkTripAccess

      // Only allow users to view their own check-in or trip owners to view any check-ins
      if (userId !== req.user?.id && accessLevel !== 'owner') {
        return res.status(403).json({ error: 'Not authorized to view this check-in' });
      }

      const checkIn = await storage.getUserTripCheckIn(tripId, userId);
      if (!checkIn) {
        return res.status(404).json({ error: 'Check-in not found' });
      }

      res.json(checkIn);
    } catch (error) {
      next(error);
    }
  });

  // Create or update a check-in for the current user
  app.post('/api/trips/:tripId/check-ins', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      if (isNaN(tripId)) {
        return res.status(400).json({ error: 'Invalid trip ID' });
      }

      // Verify user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[CHECKIN_CREATE] ");
      if (!accessLevel) return; // Response already sent by checkTripAccess

      const userId = req.user!.id;
      
      // Check if user already has a check-in
      const existingCheckIn = await storage.getUserTripCheckIn(tripId, userId);
      
      // Create or update based on existing status
      let checkIn;
      if (existingCheckIn) {
        // Update existing check-in
        checkIn = await storage.updateTripCheckIn(existingCheckIn.id, {
          status: req.body.status,
          notes: req.body.notes
        });
      } else {
        // Create new check-in
        checkIn = await storage.createTripCheckIn({
          tripId,
          userId,
          status: req.body.status || 'ready',
          notes: req.body.notes
        });
      }

      // Check if all members have checked in with 'ready' status and update trip status if needed
      const checkIns = await storage.getAllTripCheckInStatus(tripId);
      
      // Get the trip
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      
      // If the trip has a group, check if all group members have checked in
      let allReady = false;
      let notification = null;
      
      if (trip.groupId) {
        // Get all group members
        const groupMembers = await storage.getGroupMembers(trip.groupId);
        
        // Check if all members have checked in with 'ready' status
        const allMemberIds = groupMembers.map(member => member.userId);
        const checkedInUserIds = checkIns.map(checkIn => checkIn.userId);
        
        // All members have checked in and all are ready
        const allMembersCheckedIn = allMemberIds.every(id => checkedInUserIds.includes(id));
        const allCheckInsReady = checkIns.every(checkIn => checkIn.status === 'ready');
        
        allReady = allMembersCheckedIn && allCheckInsReady;
        
        if (allReady && trip.status === 'planning') {
          // Update trip status to 'confirmed'
          await storage.updateTrip(tripId, { status: 'confirmed' });
          
          // Create notification data to send to clients
          notification = {
            type: 'trip_ready',
            tripId,
            tripName: trip.name,
            message: 'All members are ready! Trip status updated to confirmed.'
          };
          
          // Send notification to all group members via WebSocket
          for (const memberId of allMemberIds) {
            const connection = userConnections.get(memberId);
            if (connection && connection.readyState === WebSocket.OPEN) {
              connection.send(JSON.stringify(notification));
            }
          }
        }
      }

      res.json({ 
        checkIn, 
        allReady,
        notification
      });
    } catch (error) {
      next(error);
    }
  });

  // Update a specific check-in (admin/trip owner only)
  app.put('/api/trips/:tripId/check-ins/:checkInId', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      const checkInId = parseInt(req.params.checkInId);
      
      if (isNaN(tripId) || isNaN(checkInId)) {
        return res.status(400).json({ error: 'Invalid trip or check-in ID' });
      }

      // Verify user has access to this trip and is owner
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[CHECKIN_UPDATE] ");
      if (!accessLevel || accessLevel !== 'owner') {
        return res.status(403).json({ error: 'Only the trip owner can update other users\'s check-ins' });
      }

      const updatedCheckIn = await storage.updateTripCheckIn(checkInId, {
        status: req.body.status,
        notes: req.body.notes
      });

      if (!updatedCheckIn) {
        return res.status(404).json({ error: 'Check-in not found' });
      }

      res.json(updatedCheckIn);
    } catch (error) {
      next(error);
    }
  });

  // Get all check-in statuses for a trip
  app.get('/api/trips/:tripId/check-in-status', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      if (isNaN(tripId)) {
        return res.status(400).json({ error: 'Invalid trip ID' });
      }

      // Verify user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[CHECKIN_STATUS] ");
      if (!accessLevel) return; // Response already sent by checkTripAccess

      // Get trip data to add location information
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      
      // Clean location data from trip
      const enhancedTrip = cleanTripLocationData(trip);
      
      // Get check-in statuses
      const checkInStatus = await storage.getAllTripCheckInStatus(tripId);
      
      // Add trip location info to the response
      const response = {
        checkInStatuses: checkInStatus,
        tripInfo: {
          startLocation: enhancedTrip.startLocation,
          startLocationDisplay: enhancedTrip.startLocationDisplay,
          destination: enhancedTrip.destination,
          destinationDisplay: enhancedTrip.destinationDisplay
        }
      };
      
      res.json(response);
    } catch (error) {
      next(error);
    }
  });
  
  // Update trip location (for tracking during in-progress trips)
  app.post('/api/trips/:tripId/location', async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      const tripId = parseInt(req.params.tripId);
      if (isNaN(tripId)) {
        return res.status(400).json({ error: 'Invalid trip ID' });
      }
      
      // Verify user has access to this trip
      const accessLevel = await checkTripAccess(req, tripId, res, next, "[LOCATION_UPDATE] ");
      if (!accessLevel) return; // Response already sent by checkTripAccess
      
      // Validate required coordinates
      const { latitude, longitude } = req.body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'Valid latitude and longitude are required' });
      }
      
      // Get the trip to check if it's in progress
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      
      // Only allow location updates for in-progress trips
      if (trip.status !== 'in-progress') {
        return res.status(400).json({
          error: 'Location updates are only allowed for in-progress trips',
          currentStatus: trip.status
        });
      }
      
      // Log location update for debugging
      console.log(`Location update via API for trip ${tripId}: ${latitude}, ${longitude}`);
      
      // Update the trip's current location
      const lastLocationUpdate = new Date();
      await storage.updateTrip(tripId, { 
        currentLatitude: latitude, 
        currentLongitude: longitude,
        lastLocationUpdate
      });
      
      // Calculate distance traveled if there are previous coordinates
      let distanceUpdate = null;
      if (trip.currentLatitude !== null && trip.currentLongitude !== null) {
        const distanceMoved = calculateDistance(
          trip.currentLatitude,
          trip.currentLongitude,
          latitude,
          longitude
        );
        
        // Only update if meaningful movement (more than 10 meters)
        if (distanceMoved > 0.01) {
          const newTotalDistance = (trip.distanceTraveled || 0) + distanceMoved;
          await storage.updateTrip(tripId, {
            distanceTraveled: newTotalDistance
          });
          distanceUpdate = {
            segmentDistance: distanceMoved,
            totalDistance: newTotalDistance
          };
        }
      }
      
      // Check if location is on route and notify about deviation if needed
      let routeStatus = null;
      if (trip.startLocation && trip.destination) {
        // Parse coordinates from locations
        const startCoords = parseCoordinates(trip.startLocation);
        const endCoords = parseCoordinates(trip.destination);
        
        if (startCoords && endCoords) {
          // Check if current location is on the route
          routeStatus = isLocationOnRoute(
            latitude,
            longitude,
            startCoords.lat,
            startCoords.lng,
            endCoords.lat,
            endCoords.lng
          );
          
          // If we've deviated from the route, send notifications
          if (!routeStatus.isOnRoute) {
            const driver = req.user;
            
            // Always notify the trip creator
            const creator = await storage.getUser(trip.createdBy);
            if (creator && creator.email) {
              console.log(`[LOCATION_UPDATE] Sending deviation email to trip creator: ${creator.email}`);
              
              // Send notification to the trip creator
              const success = await sendRouteDeviationEmail(
                creator.email,
                creator.displayName || creator.username,
                trip.name,
                driver.displayName || driver.username || "Unknown user",
                routeStatus.distanceFromRoute,
                latitude,
                longitude
              );
              
              if (success) {
                console.log(`[LOCATION_UPDATE] Successfully sent deviation email to trip creator`);
              } else {
                console.error(`[LOCATION_UPDATE] Failed to send deviation email to trip creator`);
              }
            }
            
            // Also notify all group members if the trip belongs to a group
            if (trip.groupId) {
              await notifyGroupAboutDeviation(
                trip.groupId,
                tripId,
                trip.name,
                driver.displayName || driver.username || "Unknown user",
                routeStatus.distanceFromRoute,
                latitude,
                longitude
              );
            }
          }
        }
      }
      
      // Broadcast update via WebSocket to group members if needed
      let broadcastStatus = { sent: false, recipients: 0 };
      if (trip.groupId) {
        const userId = req.user!.id;
        const groupMembers = await storage.getGroupMembers(trip.groupId);
        const memberIds = groupMembers.map(member => member.userId);
        
        // Create the update notification
        const locationUpdate = {
          type: 'trip_location_update',
          tripId,
          tripName: trip.name,
          latitude,
          longitude,
          updatedBy: userId,
          timestamp: lastLocationUpdate.toISOString()
        };
        
        // Send to all connected group members except the updater
        let sentCount = 0;
        for (const memberId of memberIds) {
          if (memberId !== userId) { // Don't send back to the updater
            const connection = userConnections.get(memberId);
            if (connection && connection.readyState === WebSocket.OPEN) {
              connection.send(JSON.stringify(locationUpdate));
              sentCount++;
            }
          }
        }
        
        broadcastStatus = { sent: sentCount > 0, recipients: sentCount };
      }
      
      // Return success response with details
      res.json({
        success: true,
        tripId,
        location: { latitude, longitude },
        lastLocationUpdate,
        distance: distanceUpdate,
        routeStatus,
        broadcast: broadcastStatus
      });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket server on the same server but with different path
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });
  
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection established');
    
    // Parse userId from the connection URL if included
    // Expected format: /ws?userId=123
    const urlParams = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = parseInt(urlParams.searchParams.get('userId') || '0');
    
    if (userId > 0) {
      // Store the connection for this user
      userConnections.set(userId, ws);
      console.log(`WebSocket connection registered for user ${userId}`);
      
      // Send a welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to TravelGroupr WebSocket server',
        userId: userId,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.log('WebSocket connection without valid user ID');
    }
    
    // Handle incoming messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        if (data.type === 'location_update' && userId > 0) {
          const { tripId, latitude, longitude } = data;
          
          if (!tripId || !latitude || !longitude) {
            console.error('Invalid location update - missing required fields');
            return;
          }
          
          // Update trip location in the database
          try {
            // Get the trip to check if it's in progress and get route info
            const trip = await storage.getTrip(tripId);
            
            if (!trip) {
              console.error(`Trip ${tripId} not found for location update`);
              return;
            }
            
            // Only process location updates for in-progress trips
            if (trip.status !== 'in-progress') {
              console.log(`Trip ${tripId} is not in progress, ignoring location update`);
              return;
            }
            
            // Log current location coordinates for debugging
            console.log(`Location update for trip ${tripId}: ${latitude}, ${longitude}`);
            
            // Update the trip's current location
            await storage.updateTrip(tripId, { 
              currentLatitude: latitude, 
              currentLongitude: longitude,
              lastLocationUpdate: new Date()
            });
            
            // Calculate distance traveled if we have previous coordinates
            if (trip.currentLatitude !== null && trip.currentLongitude !== null) {
              const distanceMoved = calculateDistance(
                trip.currentLatitude, 
                trip.currentLongitude,
                latitude,
                longitude
              );
              
              // Only update if meaningful movement (more than 10 meters)
              if (distanceMoved > 0.01) {
                await storage.updateTrip(tripId, {
                  distanceTraveled: (trip.distanceTraveled || 0) + distanceMoved
                });
              }
            }
            
            // Check if we have route information to detect deviation
            if (trip.startLocation && trip.destination) {
              // Parse coordinates from locations
              const startCoords = parseCoordinates(trip.startLocation);
              const endCoords = parseCoordinates(trip.destination);
              
              if (startCoords && endCoords) {
                // Check if current location is on the route
                const routeStatus = isLocationOnRoute(
                  latitude,
                  longitude,
                  startCoords.lat,
                  startCoords.lng,
                  endCoords.lat,
                  endCoords.lng
                );
                
                // If we've deviated from the route, send notifications
                if (!routeStatus.isOnRoute) {
                  // Get the driver info (assumes the updater is the driver)
                  const driver = await storage.getUser(userId);
                  if (driver) {
                    // Always notify the trip creator
                    const creator = await storage.getUser(trip.createdBy);
                    
                    if (creator && creator.email) {
                      console.log(`[WS_UPDATE_LOCATION] Sending deviation email to trip creator: ${creator.email}`);
                      
                      // Send notification email to the trip creator
                      const success = await sendRouteDeviationEmail(
                        creator.email,
                        creator.displayName || creator.username,
                        trip.name,
                        driver.displayName || driver.username || "Unknown user",
                        routeStatus.distanceFromRoute,
                        latitude,
                        longitude
                      );
                      
                      if (success) {
                        console.log(`[WS_UPDATE_LOCATION] Successfully sent deviation email to trip creator`);
                      } else {
                        console.error(`[WS_UPDATE_LOCATION] Failed to send deviation email to trip creator`);
                      }
                    }
                    
                    // Also notify all group members if the trip belongs to a group
                    if (trip.groupId) {
                      await notifyGroupAboutDeviation(
                        trip.groupId,
                        tripId,
                        trip.name,
                        driver.displayName || driver.username || "Unknown user",
                        routeStatus.distanceFromRoute,
                        latitude,
                        longitude
                      );
                    }
                  }
                }
              }
            }
            
            // Broadcast location update to all group members if it's a group trip
            if (trip.groupId) {
              const groupMembers = await storage.getGroupMembers(trip.groupId);
              const memberIds = groupMembers.map(member => member.userId);
              
              // Create the update notification
              const locationUpdate = {
                type: 'trip_location_update',
                tripId,
                tripName: trip.name,
                latitude,
                longitude,
                updatedBy: userId,
                timestamp: new Date().toISOString()
              };
              
              // Send to all connected group members except the updater
              for (const memberId of memberIds) {
                if (memberId !== userId) { // Don't send back to the updater
                  const connection = userConnections.get(memberId);
                  if (connection && connection.readyState === WebSocket.OPEN) {
                    connection.send(JSON.stringify(locationUpdate));
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error processing location update:', error);
          }
        }
      } catch (error) {
        console.error('Invalid WebSocket message format:', error);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      if (userId > 0) {
        userConnections.delete(userId);
        console.log(`WebSocket connection for user ${userId} closed`);
      }
    });
  });
  
  // Special endpoint for sending direct status updates with email notifications
  app.patch("/api/direct-status-update", async (req, res) => {
    console.log("[DIRECT_STATUS_UPDATE] Request received:", req.body);
    
    // Check authentication but allow requests to continue for testing
    const isLoggedIn = req.isAuthenticated();
    console.log("[DIRECT_STATUS_UPDATE] Authentication status:", isLoggedIn);
    
    if (!isLoggedIn) {
      console.log("[DIRECT_STATUS_UPDATE] Not authenticated, but proceeding for testing");
    }
    
    const { tripId, status } = req.body;
    
    if (!tripId || !status) {
      return res.status(400).json({ 
        error: "Missing required parameters", 
        message: "Both tripId and status are required" 
      });
    }
    
    console.log(`[DIRECT_STATUS_UPDATE] Updating trip ${tripId} status to '${status}'`);
    
    try {
      // Verify the trip exists and get original status
      const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }
      
      const originalStatus = trip.status;
      console.log(`[DIRECT_STATUS_UPDATE] Original status: '${originalStatus}'`);
      
      // Update the trip status
      const [updatedTrip] = await db
        .update(trips)
        .set({ status })
        .where(eq(trips.id, tripId))
        .returning();
      
      if (!updatedTrip) {
        return res.status(500).json({ error: "Failed to update trip status" });
      }
      
      console.log(`[DIRECT_STATUS_UPDATE] Status changed, directly calling sendTripStatusNotifications with status '${status}'`);
      
      // Enhanced logging for debugging
      console.log(`[DIRECT_STATUS_UPDATE] Trip details before notification:`, {
        id: updatedTrip.id,
        name: updatedTrip.name,
        creatorId: updatedTrip.createdBy,
        status: updatedTrip.status
      });
      
      // Send the status change notification
      await sendTripStatusNotifications(tripId, status);
      
      return res.json({
        success: true,
        message: `Trip ${tripId} status updated from '${originalStatus}' to '${status}'`,
        trip: updatedTrip
      });
    } catch (error) {
      console.error("[DIRECT_STATUS_UPDATE] Error updating trip status:", error);
      return res.status(500).json({ 
        error: "Server error", 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Add debug routes for email testing
  app.post('/api/debug/send-test-otp', async (req, res) => {
    try {
      const { email, name } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ 
          message: 'Email and name are required' 
        });
      }
      
      // Generate a test OTP code
      const otpCode = generateOTP();
      console.log(`[DEBUG-EMAIL] Generated test OTP code for ${email}: ${otpCode}`);
      
      // Send the OTP email
      const result = await sendOTPVerificationCode(email, name, otpCode);
      
      if (result) {
        res.json({ 
          success: true, 
          message: 'Test OTP email sent successfully',
          code: otpCode // Include the code in the response for testing
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to send test OTP email' 
        });
      }
    } catch (error) {
      console.error('[DEBUG-EMAIL] Error sending test OTP:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  });
  
  app.post('/api/debug/send-test-welcome', async (req, res) => {
    try {
      const { email, name } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ 
          message: 'Email and name are required' 
        });
      }
      
      // Send a welcome email
      const result = await sendRegistrationConfirmation(email, name);
      
      if (result) {
        res.json({ 
          success: true, 
          message: 'Test welcome email sent successfully'
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to send test welcome email' 
        });
      }
    } catch (error) {
      console.error('[DEBUG-EMAIL] Error sending test welcome email:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  });
  
  return httpServer;
}
