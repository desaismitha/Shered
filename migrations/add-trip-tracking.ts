import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { doublePrecision } from 'drizzle-orm/pg-core';

// Configure Neon to use the ws package
neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('Adding trip tracking fields to the trips table...');

  // We're performing a manual migration here because we don't want to
  // create full migrations for each small schema change
  try {
    // Add currentLatitude column
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS current_latitude double precision;
    `);

    // Add currentLongitude column
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS current_longitude double precision;
    `);

    // Add lastLocationUpdate column
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS last_location_update timestamp;
    `);

    // Add distanceTraveled column with default value
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS distance_traveled double precision DEFAULT 0;
    `);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration script failed:', error);
  process.exit(1);
});