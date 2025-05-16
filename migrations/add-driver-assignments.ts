/**
 * This migration adds the trip_driver_assignments table 
 * for managing driver and runner assignments to schedules
 */

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Creating trip_driver_assignments table...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // Create the trip_driver_assignments table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trip_driver_assignments (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      driver_id INTEGER NOT NULL REFERENCES users(id),
      vehicle_id INTEGER REFERENCES vehicles(id),
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_pattern TEXT,
      recurrence_days TEXT,
      notes TEXT,
      status TEXT DEFAULT 'scheduled',
      assigned_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Migration completed successfully');
  await pool.end();
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});