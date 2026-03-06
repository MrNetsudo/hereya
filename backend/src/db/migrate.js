'use strict';

/**
 * LOCI — Startup Database Migrator
 * Runs incremental SQL migrations on app startup.
 * Safe to run multiple times (idempotent SQL with IF NOT EXISTS / IF EXISTS).
 */

const { Client } = require('pg');
const logger = require('../utils/logger');

const MIGRATIONS = [
  {
    name: '20260305_000004_email_auth',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS otp_codes (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        code       VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used       BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);
      CREATE INDEX IF NOT EXISTS idx_otp_codes_email_used ON otp_codes(email, used);
    `,
  },
];

/**
 * Build connection string using the Supabase pooler (IPv4-compatible).
 * The direct DB endpoint (port 5432) is IPv6-only in some regions.
 * The pooler (port 6543) has IPv4 support.
 */
function getPoolerUrl(directUrl) {
  if (!directUrl) return directUrl;
  // Replace direct DB host/port with pooler endpoint
  // Direct:  postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
  // Pooler:  postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
  const match = directUrl.match(/postgres:([^@]+)@db\.([a-z]+)\.supabase\.co:5432\/postgres/);
  if (match) {
    const [, password, ref] = match;
    return `postgres.${ref}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  }
  return directUrl;
}

async function runMigrations() {
  const rawUrl = process.env.LOCI_DATABASE_URL;
  if (!rawUrl) {
    logger.warn('LOCI_DATABASE_URL not set — skipping migrations');
    return;
  }

  // Use pooler for IPv4 compatibility
  const dbUrl = getPoolerUrl(rawUrl);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    logger.info('DB connected — running migrations');

    for (const migration of MIGRATIONS) {
      try {
        await client.query(migration.sql);
        logger.info(`Migration OK: ${migration.name}`);
      } catch (err) {
        // Log but don't crash — some migrations may already be applied
        logger.warn(`Migration warning (${migration.name}): ${err.message}`);
      }
    }

    logger.info('Migrations complete');
  } catch (err) {
    logger.error('Migration runner failed to connect', { err: err.message });
    // Don't crash the server — migration failure is non-fatal
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { runMigrations };
