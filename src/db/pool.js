import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and fill it in.'
  );
}

/**
 * Neon terminates idle connections and sits behind a pooler, so a long-lived
 * client will eventually be dropped from under us. Keep the pool small and let it
 * recycle rather than holding connections open.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle client erroring out is not fatal; the pool replaces it.
  console.error('[db] idle client error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/** Run a set of statements in a transaction, rolling back on any failure. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
