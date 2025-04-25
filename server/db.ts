import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enhanced connection pool configuration with timeout and error handling
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // timeout after which the connection attempt is aborted
});

// Add event handlers for connection issues
pool.on('connect', (client) => {
  console.log('New database connection established');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client', err);
  // Do not terminate the process, allow for recovery
  // process.exit(-1);
});

// Create drizzle instance with the pool
export const db = drizzle({ client: pool, schema });

// Helper function to check connection
export async function checkDbConnection() {
  let client;
  try {
    client = await pool.connect();
    // Run a simple query to test the connection
    await client.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Export a function to attempt reconnection
export async function attemptReconnect(maxRetries = 5, retryDelay = 2000) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`Attempting database reconnection (${retries + 1}/${maxRetries})...`);
      const connected = await checkDbConnection();
      
      if (connected) {
        console.log('Successfully reconnected to the database');
        return true;
      }
    } catch (error) {
      console.error(`Reconnection attempt ${retries + 1} failed:`, error);
    }
    
    retries++;
    if (retries < maxRetries) {
      console.log(`Waiting ${retryDelay}ms before next retry`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.error('All database reconnection attempts failed');
  return false;
}