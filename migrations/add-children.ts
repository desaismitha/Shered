/**
 * This migration adds the children table for associating children with user profiles
 */
import { db, pool } from '../server/db';

async function main() {
  console.log('Starting migration: add-children');
  
  try {
    // Create the children table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        picture_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('Successfully created children table');
  } catch (error) {
    console.error('Error in migration:', error);
    throw error;
  } finally {
    // Close the database connection
    console.log('Closing database connection');
    await pool.end();
  }
}

main()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });