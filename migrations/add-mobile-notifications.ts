import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure the WebSocket constructor for Neon
neonConfig.webSocketConstructor = ws;

/**
 * This migration adds the enable_mobile_notifications column to the trips table
 */
async function main() {
  // Get database URL from environment variables
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Connect to the database
  const pool = new Pool({ connectionString: databaseUrl });
  console.log('Connected to database');

  try {
    // Add the enable_mobile_notifications column to the trips table with a default value of false
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS enable_mobile_notifications BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('Successfully added enable_mobile_notifications column to trips table');

    // Verify the column was added successfully
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trips' AND column_name = 'enable_mobile_notifications';
    `);
    
    if (result.rows.length > 0) {
      console.log('Verified column was added:', result.rows[0]);
    } else {
      console.error('Column verification failed - column not found');
    }
  } catch (error) {
    console.error('Error executing migration:', error);
    throw error;
  } finally {
    // Close database connection
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the migration
main().catch(console.error);
