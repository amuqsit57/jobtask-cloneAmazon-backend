import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Applies schema.sql (which drops and recreates the core tables) only when asked,
 * then every numbered migration in migrations/ in order.
 *
 * Migrations are written to be idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
 * EXISTS) so re-running them is safe. That is cheaper here than a migrations
 * ledger table, and it means a fresh deploy and an existing database take the
 * same path.
 *
 *   npm run migrate           apply migrations only (safe, keeps data)
 *   npm run migrate -- --fresh  rebuild from schema.sql, then migrate (destroys data)
 */
const FRESH = process.argv.includes('--fresh');

async function main() {
  if (FRESH) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('[migrate] applying schema.sql (fresh rebuild)...');
    await pool.query(schema);
  }

  const dir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    : [];

  for (const f of files) {
    console.log(`[migrate] ${f}`);
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  console.log(`[migrate] done. ${rows[0].n} tables.`);
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
