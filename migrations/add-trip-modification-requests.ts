/**
 * This migration adds the trip_modification_requests table for non-admin users
 * to request changes to schedules that require admin approval
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Running migration: add-trip-modification-requests");

  try {
    // Create the trip_modification_requests table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trip_modification_requests (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        requested_by INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        request_data JSONB NOT NULL,
        admin_notes TEXT,
        reviewed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add an index for faster lookups by trip_id
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_trip_mod_requests_trip_id ON trip_modification_requests(trip_id);
    `);

    // Add an index for faster lookups by requested_by
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_trip_mod_requests_requested_by ON trip_modification_requests(requested_by);
    `);

    // Add an index for faster filtering by status
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_trip_mod_requests_status ON trip_modification_requests(status);
    `);

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    // Close the pool to prevent the script from hanging
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});