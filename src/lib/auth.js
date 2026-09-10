import jwt from 'jsonwebtoken';
import { env } from './env.js';

const SECRET = env.JWT_SECRET;
const EXPIRES_IN = env.JWT_EXPIRES_IN;

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, name: user.name },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuth(req, _res, next) {
  const token = bearer(req);
  const payload = token ? verifyToken(token) : null;
  if (payload) req.user = { id: Number(payload.sub), email: payload.email, name: payload.name };
  next();
}

/** Rejects the request unless a valid token is present. */
export function requireAuth(req, res, next) {
  const token = bearer(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = { id: Number(payload.sub), email: payload.email, name: payload.name };
  next();
}
