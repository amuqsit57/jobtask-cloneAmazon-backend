import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../lib/auth.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*, COUNT(p.id)::int AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.sort`
    );
    res.json({
      categories: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        image: r.image_url,
        productCount: r.product_count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export const addressesRouter = Router();
addressesRouter.use(requireAuth);

addressesRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id',
      [req.user.id]
    );
    res.json({ addresses: rows });
  } catch (err) {
    next(err);
  }
});

addressesRouter.post('/', async (req, res, next) => {
  try {
    const { full_name, line1, line2, city, state, postal_code, phone, is_default } =
      req.body ?? {};
    if (!full_name || !line1 || !city || !state || !postal_code) {
      return res.status(400).json({ error: 'Missing required address fields' });
    }

    // Only one default at a time, so promoting a new one demotes the rest.
    if (is_default) {
      await query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [
        req.user.id,
      ]);
    }

    const { rows } = await query(
      `INSERT INTO addresses
         (user_id, full_name, line1, line2, city, state, postal_code, phone, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, full_name, line1, line2 ?? null, city, state, postal_code,
       phone ?? null, Boolean(is_default)]
    );
    res.status(201).json({ address: rows[0] });
  } catch (err) {
    next(err);
  }
});
