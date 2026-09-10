import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../lib/auth.js';
import { serializeProduct } from '../lib/serialize.js';

export const wishlistRouter = Router();

/** Every user gets a default list lazily, so the UI never has to create one first. */
async function defaultList(userId) {
  const found = await query(
    'SELECT * FROM wishlists WHERE user_id = $1 ORDER BY id LIMIT 1',
    [userId]
  );
  if (found.rowCount) return found.rows[0];

  const { rows } = await query(
    `INSERT INTO wishlists (user_id, name, share_slug)
     VALUES ($1, 'Shopping List', $2) RETURNING *`,
    [userId, `wl-${userId}-${Math.random().toString(36).slice(2, 10)}`]
  );
  return rows[0];
}

async function itemsFor(wishlistId) {
  const { rows } = await query(
    `SELECT p.*, wi.id AS wishlist_item_id, wi.added_at,
            c.slug AS category_slug, c.name AS category_name,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id
              ORDER BY sort LIMIT 1) AS image_url
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE wi.wishlist_id = $1
     ORDER BY wi.added_at DESC`,
    [wishlistId]
  );
  return rows.map((r) =>
    serializeProduct(r, {
      rest: { wishlistItemId: r.wishlist_item_id, addedAt: r.added_at },
    })
  );
}

// A shared list is readable without signing in - that is the point of sharing.
wishlistRouter.get('/shared/:slug', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT w.*, u.name AS owner_name FROM wishlists w
       JOIN users u ON u.id = w.user_id
       WHERE w.share_slug = $1 AND w.is_public = TRUE`,
      [req.params.slug]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'This list is not shared or does not exist' });
    }
    res.json({
      wishlist: {
        name: rows[0].name,
        ownerName: rows[0].owner_name,
        isPublic: true,
        items: await itemsFor(rows[0].id),
      },
    });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.use(requireAuth);

wishlistRouter.get('/', async (req, res, next) => {
  try {
    const list = await defaultList(req.user.id);
    res.json({
      wishlist: {
        id: list.id,
        name: list.name,
        isPublic: list.is_public,
        shareSlug: list.share_slug,
        items: await itemsFor(list.id),
      },
    });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.post('/items', async (req, res, next) => {
  try {
    const { productId } = req.body ?? {};
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const list = await defaultList(req.user.id);
    await query(
      `INSERT INTO wishlist_items (wishlist_id, product_id) VALUES ($1, $2)
       ON CONFLICT (wishlist_id, product_id) DO NOTHING`,
      [list.id, productId]
    );
    res.status(201).json({ items: await itemsFor(list.id) });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.delete('/items/:productId', async (req, res, next) => {
  try {
    const list = await defaultList(req.user.id);
    await query(
      'DELETE FROM wishlist_items WHERE wishlist_id = $1 AND product_id = $2',
      [list.id, req.params.productId]
    );
    res.json({ items: await itemsFor(list.id) });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.patch('/', async (req, res, next) => {
  try {
    const list = await defaultList(req.user.id);
    const { name, isPublic } = req.body ?? {};
    const { rows } = await query(
      `UPDATE wishlists
       SET name = COALESCE($1, name), is_public = COALESCE($2, is_public)
       WHERE id = $3 RETURNING *`,
      [name ?? null, isPublic ?? null, list.id]
    );
    res.json({
      wishlist: {
        id: rows[0].id,
        name: rows[0].name,
        isPublic: rows[0].is_public,
        shareSlug: rows[0].share_slug,
      },
    });
  } catch (err) {
    next(err);
  }
});
