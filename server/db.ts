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

// Standard connection pool configuration that's compatible with Neon
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20, // reasonable maximum
  idleTimeoutMillis: 30000, // standard idle timeout
  connectionTimeoutMillis: 5000, // standard connection timeout
  allowExitOnIdle: false // don't close idle connections
});

// Add event handlers for connection issues, but only log in development
pool.on('connect', (client) => {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_DB_CONNECTIONS === 'true') {
    console.log('New database connection established');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client', err);
  
  // Check for specific termination errors
  if ((err as any).code === '57P01' || 
      (err as any).code === '57P02' || 
      (err as any).code === '57P03' ||
      err.message.includes('terminating connection') || 
      err.message.includes('connection reset')) {
      
    console.log('Detected connection termination, attempting to reconnect...');
    
    // Attempt to reconnect immediately in the background
    setTimeout(async () => {
      try {
        await attemptReconnect(3, 1000);
      } catch (reconnectError) {
        console.error('Error during reconnection attempt:', reconnectError);
      }
    }, 100); // Reduced delay before reconnect attempt
  }
});

// Create drizzle instance with the pool
export const db = drizzle({ client: pool, schema });

// Set up a health check to periodically test database connection
// but make it quieter to avoid logging noise
setInterval(async () => {
  try {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      console.log('Periodic health check detected database issue, resetting connections...');
      await attemptReconnect(2, 500);
    }
  } catch (error) {
    console.error('Error during periodic database health check:', error);
  }
}, 60000); // Check every minute

// Also pre-warm connections on startup for faster initial responses
(async function preWarmPoolOnStartup() {
  console.log('Pre-warming connection pool on startup...');
  try {
    // Create multiple connections in parallel to fill the pool
    const preWarmPromises = [...Array(5)].map(async (_, i) => {
      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        console.log(`Initial connection ${i+1} established successfully`);
        client.release(true); // true = connection is OK
      } catch (err) {
        console.error(`Failed to establish initial connection ${i+1}:`, err);
      }
    });
    
    await Promise.all(preWarmPromises);
    console.log('Connection pool pre-warming complete');
  } catch (error) {
    console.error('Error during startup pool pre-warming:', error);
  }
})();

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

// Improved connection recovery function with faster reconnect strategy
export async function attemptReconnect(maxRetries = 3, retryDelay = 1000) {
  let retries = 0;
  let success = false;
  
  // Try multiple reconnection strategies with reduced delays
  while (retries < maxRetries && !success) {
    try {
      console.log(`Attempting database reconnection (${retries + 1}/${maxRetries})...`);
      
      // First try: Simple connection test
      success = await checkDbConnection();
      
      // If basic connection check succeeded
      if (success) {
        console.log('Successfully reconnected to the database');
        return true;
      }
      
      // If first try failed and we're on first retry, try a faster approach immediately
      if (retries === 0) {
        // Try to grab a new connection right away
        const client = await pool.connect();
        client.release(); // Release it immediately
        console.log('Successfully established new connection');
        success = true;
        return true;
      }
      
      // If we're on second retry, reset the connection pool
      if (retries === 1) {
        console.log('Resetting the connection pool...');
        success = await cleanupConnections();
        if (success) return true;
      }
    } catch (error) {
      console.error(`Reconnection attempt ${retries + 1} failed:`, error);
    }
    
    retries++;
    
    if (retries < maxRetries && !success) {
      // Short fixed delay between retries - we want to recover quickly
      const backoffDelay = retryDelay;
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  if (!success) {
    console.error('All database reconnection attempts failed');
  }
  
  return success;
}