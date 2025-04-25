import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Create a connection pool
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Connected to database');

    // Execute the migration
    console.log('Making groupId column nullable in trips table...');

    // First drop the foreign key constraint
    await pool.query(`
      ALTER TABLE trips
      DROP CONSTRAINT IF EXISTS trips_group_id_fkey;
    `);
    
    console.log('Dropped foreign key constraint');

    // Add the foreign key constraint back but with ON DELETE SET NULL
    await pool.query(`
      ALTER TABLE trips
      ADD CONSTRAINT trips_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES groups(id)
      ON DELETE SET NULL;
    `);

    console.log('Added new foreign key constraint with ON DELETE SET NULL');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await pool.end();
  }
}

main().catch(console.error);