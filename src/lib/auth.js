import jwt from 'jsonwebtoken';
import { env } from './env.js';

const SECRET = env.JWT_SECRET;
const EXPIRES_IN = env.JWT_EXPIRES_IN;

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role || 'customer',
    },
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
  if (payload) {
    req.user = {
      id: Number(payload.sub),
      email: payload.email,
      name: payload.name,
      role: payload.role || 'customer',
    };
  }
  next();
}

/** Rejects the request unless a valid token is present. */
export function requireAuth(req, res, next) {
  const token = bearer(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = {
    id: Number(payload.sub),
    email: payload.email,
    name: payload.name,
    role: payload.role || 'customer',
  };
  next();
}

/**
 * Gate a route on role. Admins pass every check: an admin can do anything a
 * seller can, which avoids duplicating routes for the two roles.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({
      error: `This area is for ${roles.join(' or ')} accounts`,
    });
  };
}
