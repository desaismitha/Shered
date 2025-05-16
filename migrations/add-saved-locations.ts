/**
 * This migration adds the saved_locations table for users to save frequently used locations
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Running migration: add-saved-locations");

  // Create the saved_locations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS saved_locations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      visit_count INTEGER NOT NULL DEFAULT 1,
      last_visited TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Migration completed successfully");
}

main()
  .catch((e) => {
    console.error("Migration failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Close DB connection
    console.log("Cleaning up...");
    process.exit(0);
  });