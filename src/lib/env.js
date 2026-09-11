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
  // On a host there is no .env file to copy - the variables come from the
  // dashboard - so say that rather than giving only the local instruction.
  const onHost = Boolean(
    process.env.RENDER || process.env.VERCEL || process.env.FLY_APP_NAME ||
      process.env.DYNO || process.env.NODE_ENV === 'production'
  );
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}.
` +
      (onHost
        ? 'Set them in your host dashboard (Render: Service -> Environment). ' +
          'render.yaml is only applied to services created from a Blueprint; ' +
          'a manually created service uses the dashboard values instead.'
        : 'Copy .env.example to .env and fill it in.')
  );
}
