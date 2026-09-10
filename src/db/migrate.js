import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] applying schema...');
  await pool.query(sql);
  console.log('[migrate] done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
