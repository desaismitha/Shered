/**
 * This migration adds the latitude, longitude, and location_verified columns to the trip_check_ins table
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Starting migration: Add coordinates to trip_check_ins");

  try {
    // Add latitude column
    await db.execute(sql`
      ALTER TABLE trip_check_ins 
      ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION
    `);
    console.log("Added latitude column");

    // Add longitude column
    await db.execute(sql`
      ALTER TABLE trip_check_ins 
      ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
    `);
    console.log("Added longitude column");

    // Add location_verified column
    await db.execute(sql`
      ALTER TABLE trip_check_ins 
      ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT FALSE
    `);
    console.log("Added location_verified column");

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

main()
  .then(() => {
    console.log("Migration complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });