import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { promisify } from 'util';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enhanced connection pool configuration with timeout and error handling
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // maximum number of clients in the pool (reduced to prevent connection limits)
  min: 1, // maintain at least one connection
  idleTimeoutMillis: 60000, // increased idle timeout to 60s
  connectionTimeoutMillis: 5000, // increased connection timeout to 5s
  allowExitOnIdle: false, // don't close idle connections on app exit
  keepAlive: true, // enable TCP keepalive
  keepAliveInitialDelayMillis: 30000, // keepalive probe delay in ms
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

// Try to clean up and close all idle connections
export async function cleanupConnections() {
  try {
    console.log('Attempting to clean up idle database connections...');
    await pool.end();
    
    // Create new pool with the same settings after a brief delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newPool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 10,
      min: 1, 
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: false,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30000,
    });
    
    // Replace the global pool reference
    Object.assign(pool, newPool);
    
    // Update the drizzle client
    Object.assign(db, drizzle({ client: pool, schema }));
    
    console.log('Database connection pool has been reset');
    return true;
  } catch (error) {
    console.error('Failed to clean up connections:', error);
    return false;
  }
}

// Export a function to attempt reconnection
export async function attemptReconnect(maxRetries = 5, retryDelay = 2000) {
  let retries = 0;
  
  // First try the simple reconnection approach
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
    
    // If we've tried a few times, try a more aggressive approach by resetting the pool
    if (retries === Math.floor(maxRetries / 2)) {
      console.log('Trying to reset the connection pool...');
      await cleanupConnections();
    }
    
    if (retries < maxRetries) {
      // Exponential backoff - increase delay with each retry
      const backoffDelay = retryDelay * Math.pow(1.5, retries - 1);
      console.log(`Waiting ${backoffDelay}ms before next retry`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  console.error('All database reconnection attempts failed');
  return false;
}