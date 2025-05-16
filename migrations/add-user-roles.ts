/**
 * This migration adds the role field to the users table
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

async function main() {
  try {
    console.log("Starting migration: Add role field to users table");
    
    // Add role column to users table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Parent/Guardian'
    `);

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log("Migration script completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration script failed:", err);
    process.exit(1);
  });