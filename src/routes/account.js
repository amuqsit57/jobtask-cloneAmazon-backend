import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../lib/auth.js';
import { formatPrice } from '../lib/serialize.js';

export const couponsRouter = Router();

/**
 * Validate a coupon against a subtotal. Deliberately a lookup rather than a
 * mutation: the discount is recomputed server-side at order placement, so a
 * client cannot hold a stale or tampered discount between here and checkout.
 */
couponsRouter.post('/validate', async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const subtotal = Number(req.body?.subtotal ?? 0);
    if (!code) return res.status(400).json({ error: 'Enter a promo code' });

    const { rows } = await query(
      `SELECT * FROM coupons WHERE code = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [code]
    );
    const coupon = rows[0];
    if (!coupon) {
      return res.status(404).json({ error: 'That promo code is not valid' });
    }
    if (subtotal < coupon.min_subtotal_cents) {
      return res.status(400).json({
        error: `Spend ${formatPrice(coupon.min_subtotal_cents)} or more to use this code`,
      });
    }

    const discount = coupon.percent_off
      ? Math.round((subtotal * coupon.percent_off) / 100)
      : Math.min(coupon.amount_off_cents, subtotal);

    res.json({
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discount,
        discountFormatted: formatPrice(discount),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------

export const primeRouter = Router();
primeRouter.use(requireAuth);

primeRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT is_prime, prime_since FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({
      isPrime: rows[0]?.is_prime ?? false,
      since: rows[0]?.prime_since ?? null,
      priceFormatted: '$14.99',
      benefits: [
        'FREE One-Day and Two-Day Delivery on millions of items',
        'Prime Video: thousands of movies and TV episodes',
        'Prime Music: ad-free listening',
        'Prime Reading: a rotating catalogue of books and magazines',
        'Exclusive access to Lightning Deals',
        'Unlimited photo storage with Amazon Photos',
      ],
    });
  } catch (err) {
    next(err);
  }
});

primeRouter.post('/', async (req, res, next) => {
  try {
    const join = req.body?.join !== false;
    const { rows } = await query(
      `UPDATE users
       SET is_prime = $1, prime_since = CASE WHEN $1 THEN COALESCE(prime_since, NOW()) ELSE NULL END
       WHERE id = $2 RETURNING is_prime, prime_since`,
      [join, req.user.id]
    );
    res.json({ isPrime: rows[0].is_prime, since: rows[0].prime_since });
  } catch (err) {
    next(err);
  }
});
