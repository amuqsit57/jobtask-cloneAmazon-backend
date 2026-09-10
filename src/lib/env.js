/**
 * Load .env before anything else reads process.env.
 *
 * ES module imports are hoisted and evaluated depth-first, so a module that reads
 * an env var at module scope runs before any dotenv.config() sitting in the entry
 * file. Importing this module first is what makes those reads safe.
 */
import dotenv from 'dotenv';

dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  PORT: Number(process.env.PORT) || 4000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !env[k]);
if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill it in.'
  );
}
