import { db, pool } from "../server/db";
import { savedLocations } from "../shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  try {
    console.log("Starting migration to add saved_locations table...");
    
    // Create saved_locations table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 1,
        last_visited TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

main();