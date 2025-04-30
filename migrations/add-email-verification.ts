import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * This migration adds email verification fields to the users table
 */
async function main() {
  console.log("Adding email verification fields to users table...");

  // Add email_verified column
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
  `);

  // Add verification_token column
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS verification_token TEXT;
  `);

  // Add verification_token_expiry column
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS verification_token_expiry TIMESTAMP;
  `);

  // Add otp_token column
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS otp_token TEXT;
  `);

  // Add otp_token_expiry column
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS otp_token_expiry TIMESTAMP;
  `);

  console.log("Email verification fields added successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed!", err);
    process.exit(1);
  });