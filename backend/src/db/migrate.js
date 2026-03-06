'use strict';

/**
 * Hereya — Startup Database Migrator (No-op safe)
 *
 * Note: The primary OTP mechanism uses Supabase's internal OTP storage
 * (via generateLink + /auth/v1/verify), so no otp_codes table is required.
 *
 * Optional columns (email, email_verified) can be added via Supabase Dashboard
 * SQL Editor if needed for future features. The auth flow works without them.
 */

const logger = require('../utils/logger');

async function runMigrations() {
  // Migration is now a no-op for the email OTP flow since we use
  // Supabase's built-in OTP mechanism and store email data in auth.users.
  //
  // If you need the optional email/email_verified columns on the users table,
  // run this SQL in the Supabase Dashboard SQL Editor:
  //
  //   ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
  //   ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
  //
  logger.info('Migrations: no-op (email auth uses Supabase built-in OTP)');
}

module.exports = { runMigrations };
