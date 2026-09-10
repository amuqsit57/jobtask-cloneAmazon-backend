import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Must come before any module that reads process.env at module scope.
import { env } from './lib/env.js';

import { optionalAuth } from './lib/auth.js';
import { productsRouter } from './routes/products.js';
import { authRouter } from './routes/auth.js';
import { cartRouter } from './routes/cart.js';
import { ordersRouter } from './routes/orders.js';
import { categoriesRouter, addressesRouter } from './routes/misc.js';
import { pool } from './db/pool.js';

const app = express();
const PORT = env.PORT;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/**
 * The deployed frontend and localhost both need access. CORS_ORIGIN takes a
 * comma-separated list; requests with no Origin (curl, server-side fetches from
 * Next.js) are allowed through since CORS only governs browser callers.
 */
const allowed = env.CORS_ORIGIN
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
      // Any Vercel preview deployment of this project.
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-cart-session'],
  })
);

// Auth endpoints are the ones worth brute forcing, so they get a tighter limit.
app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false })
);
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

app.use(optionalAuth);

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT (SELECT COUNT(*) FROM products)::int AS products, NOW() AS now'
    );
    res.json({ ok: true, db: 'connected', products: rows[0].products, time: rows[0].now });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'unreachable', error: err.message });
  }
});

app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', authRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/addresses', addressesRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

export default app;
