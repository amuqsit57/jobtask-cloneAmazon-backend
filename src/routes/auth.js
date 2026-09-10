import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { signToken, requireAuth } from '../lib/auth.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Passwords must be at least 6 characters'),
  name: z.string().min(1).optional(),
});

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  isPrime: u.is_prime,
  role: u.role || 'customer',
  storeName: u.store_name ?? null,
  storeSlug: u.store_slug ?? null,
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0].message });
    }
    const { email, password, name } = parsed.data;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, name?.trim() || email.split('@')[0], hash]
    );

    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    // Same message and roughly the same work whether or not the account exists,
    // so the response does not reveal which emails are registered.
    if (!user || !user.password_hash) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

/** Used by NextAuth to resolve the current session against the API. */
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/**
 * Upsert for OAuth sign-in. NextAuth owns the provider handshake; this exchanges
 * a verified provider identity for an API token so the frontend has one auth model.
 */
authRouter.post('/oauth', async (req, res, next) => {
  try {
    const { email, name } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { rows } = await query(
      `INSERT INTO users (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name)
       RETURNING *`,
      [email, name || email.split('@')[0]]
    );

    const user = rows[0];
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});
