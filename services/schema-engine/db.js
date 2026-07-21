'use strict';

/**
 * PostgreSQL connection + auto-migration for Schema Engine
 *
 * Creates the core tables on first connection:
 *   - schemas   : schema definitions (fields JSONB)
 *   - records   : dynamic data rows (data JSONB, indexed by schema_id)
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE || 'superapp_schema',
  user: process.env.PGUSER || 'superapp',
  password: process.env.PGPASSWORD || 'superapp',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Auto-create core tables + indexes if they don't exist
 */
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Schemas table ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS schemas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        template VARCHAR(255) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Records table ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Indexes ────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_records_schema_id ON records(schema_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_records_data_gin ON records USING GIN (data);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
    `);

    // ── updated_at trigger ─────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Apply trigger to both tables (idempotent)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_schemas_updated_at') THEN
          CREATE TRIGGER update_schemas_updated_at
            BEFORE UPDATE ON schemas
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_records_updated_at') THEN
          CREATE TRIGGER update_records_updated_at
            BEFORE UPDATE ON records
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('[DB] Migration complete — schemas + records tables ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a parameterized query.
 * Accepts optional `client` for transactional queries.
 * When client is provided, uses client.query() instead of pool.query().
 */
async function query(text, params = [], client) {
  const start = Date.now();
  const result = client
    ? await client.query(text, params)
    : await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' || process.env.LOG_QUERIES) {
    console.log(`[DB] query ${duration}ms — ${text.slice(0, 120)}`);
  }
  return result;
}

/**
 * Run a callback inside a PostgreSQL transaction.
 *
 * - BEGINs a transaction
 * - Passes the client to `callback(client)`
 * - COMMITs on success
 * - ROLLBACKs on error
 * - Releases the client to the pool in either case
 *
 * @param {function} callback  — async (client) => result
 * @returns {Promise<*>}  — the callback's return value
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, migrate, query, withTransaction, getClient };
