import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Starting migration: Add recurring itinerary functionality...");

  try {
    // Add new columns to itinerary_items table
    await db.execute(sql`
      ALTER TABLE itinerary_items 
      ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT,
      ADD COLUMN IF NOT EXISTS recurrence_days TEXT,
      ADD COLUMN IF NOT EXISTS from_location TEXT,
      ADD COLUMN IF NOT EXISTS to_location TEXT
    `);

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();