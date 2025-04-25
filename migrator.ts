import { pool, db } from './server/db';
import * as schema from './shared/schema';

async function main() {
  try {
    console.log('Pushing schema to database...');
    
    // Log current tables
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Current tables:', res.rows.map((r: any) => r.table_name));
    
    // Create tables from schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reset_token TEXT,
        reset_token_expiry TIMESTAMP,
        license_number TEXT,
        license_state TEXT,
        license_expiry TIMESTAMP,
        is_eligible_driver BOOLEAN DEFAULT FALSE
      );
      
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      );
      
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        created_by INTEGER NOT NULL REFERENCES users(id),
        destination TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS itinerary_items (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id),
        created_by INTEGER NOT NULL REFERENCES users(id),
        day INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        start_time TEXT,
        end_time TEXT
      );
      
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id),
        title TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        date TIMESTAMP,
        paid_by INTEGER NOT NULL REFERENCES users(id),
        split_among INTEGER[] NOT NULL,
        category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER,
        capacity INTEGER,
        color TEXT,
        license_plate TEXT,
        notes TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS trip_vehicles (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id),
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        is_main BOOLEAN DEFAULT TRUE,
        assigned_to INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trip_id, vehicle_id)
      );
    `);
    
    // Log created tables
    const afterRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Tables after migration:', afterRes.rows.map((r: any) => r.table_name));
    
    // Add missing columns to the users table
    try {
      console.log('Adding driver license columns to users table...');
      await db.execute(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS license_number TEXT,
        ADD COLUMN IF NOT EXISTS license_state TEXT,
        ADD COLUMN IF NOT EXISTS license_expiry TIMESTAMP,
        ADD COLUMN IF NOT EXISTS is_eligible_driver BOOLEAN DEFAULT FALSE;
      `);
      console.log('Added driver license columns successfully');
    } catch (error) {
      console.error('Error adding driver license columns:', error);
    }
    
    console.log('Schema pushed successfully!');
  } catch (error) {
    console.error('Error pushing schema:', error);
  } finally {
    await pool.end();
  }
}

main();