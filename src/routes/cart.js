import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { formatPrice } from '../lib/serialize.js';

export const cartRouter = Router();

/**
 * A cart is keyed by user id when signed in, and by an opaque session id header
 * otherwise. Guests can fill a cart before they have an account, which is how
 * Amazon behaves and is the difference between a demo and something usable.
 */
async function resolveCart(req, { create = true } = {}) {
  const userId = req.user?.id ?? null;
  const sessionId = req.get('x-cart-session') || null;

  if (!userId && !sessionId) return null;

  const found = userId
    ? await query('SELECT * FROM carts WHERE user_id = $1', [userId])
    : await query('SELECT * FROM carts WHERE session_id = $1', [sessionId]);

  if (found.rowCount) return found.rows[0];
  if (!create) return null;

  const { rows } = await query(
    'INSERT INTO carts (user_id, session_id) VALUES ($1, $2) RETURNING *',
    [userId, userId ? null : sessionId]
  );
  return rows[0];
}

async function cartPayload(cartId) {
  const { rows } = await query(
    `SELECT ci.id, ci.quantity, ci.saved_for_later,
            p.id AS product_id, p.slug, p.title, p.price_cents, p.stock,
            p.is_prime, p.brand,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id
              ORDER BY sort LIMIT 1) AS image_url
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = $1
     ORDER BY ci.added_at DESC`,
    [cartId]
  );

  const map = (r) => ({
    id: r.id,
    productId: r.product_id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    image: r.image_url,
    price: Number(r.price_cents),
    priceFormatted: formatPrice(r.price_cents),
    quantity: Number(r.quantity),
    stock: Number(r.stock),
    inStock: Number(r.stock) > 0,
    isPrime: r.is_prime,
    lineTotal: Number(r.price_cents) * Number(r.quantity),
    lineTotalFormatted: formatPrice(Number(r.price_cents) * Number(r.quantity)),
  });

  const active = rows.filter((r) => !r.saved_for_later).map(map);
  const saved = rows.filter((r) => r.saved_for_later).map(map);

  const subtotal = active.reduce((sum, i) => sum + i.lineTotal, 0);
  const count = active.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items: active,
    savedForLater: saved,
    count,
    subtotal,
    subtotalFormatted: formatPrice(subtotal),
    freeShippingEligible: subtotal >= 3500,
    freeShippingRemaining: Math.max(0, 3500 - subtotal),
    freeShippingRemainingFormatted: formatPrice(Math.max(0, 3500 - subtotal)),
  };
}

cartRouter.get('/', async (req, res, next) => {
  try {
    const cart = await resolveCart(req, { create: false });
    if (!cart) {
      return res.json({
        items: [], savedForLater: [], count: 0, subtotal: 0,
        subtotalFormatted: formatPrice(0),
        freeShippingEligible: false,
        freeShippingRemaining: 3500,
        freeShippingRemainingFormatted: formatPrice(3500),
      });
    }
    res.json(await cartPayload(cart.id));
  } catch (err) {
    next(err);
  }
});

cartRouter.post('/items', async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body ?? {};
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const qty = Math.max(1, Math.min(Number(quantity) || 1, 30));

    const product = await query('SELECT id, stock FROM products WHERE id = $1', [productId]);
    if (!product.rowCount) return res.status(404).json({ error: 'Product not found' });

    const cart = await resolveCart(req);
    if (!cart) {
      return res.status(400).json({ error: 'No cart session. Send an x-cart-session header.' });
    }

    // Adding a product already in the cart increases quantity rather than
    // creating a duplicate line, capped at available stock.
    await query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, $4),
                     saved_for_later = FALSE`,
      [cart.id, productId, qty, Math.max(product.rows[0].stock, 1)]
    );

    res.status(201).json(await cartPayload(cart.id));
  } catch (err) {
    next(err);
  }
});

cartRouter.patch('/items/:id', async (req, res, next) => {
  try {
    const { quantity, savedForLater } = req.body ?? {};
    const cart = await resolveCart(req, { create: false });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    if (quantity != null) {
      const qty = Number(quantity);
      if (qty <= 0) {
        await query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [
          req.params.id, cart.id,
        ]);
      } else {
        await query(
          'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND cart_id = $3',
          [Math.min(qty, 30), req.params.id, cart.id]
        );
      }
    }

    if (savedForLater != null) {
      await query(
        'UPDATE cart_items SET saved_for_later = $1 WHERE id = $2 AND cart_id = $3',
        [Boolean(savedForLater), req.params.id, cart.id]
      );
    }

    res.json(await cartPayload(cart.id));
  } catch (err) {
    next(err);
  }
});

cartRouter.delete('/items/:id', async (req, res, next) => {
  try {
    const cart = await resolveCart(req, { create: false });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    await query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [
      req.params.id, cart.id,
    ]);
    res.json(await cartPayload(cart.id));
  } catch (err) {
    next(err);
  }
});

/**
 * Merge a guest cart into the signed-in user's cart. Called right after login,
 * otherwise everything a guest added disappears the moment they sign in.
 */
cartRouter.post('/merge', async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const sessionId = req.body?.sessionId || req.get('x-cart-session');
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const merged = await withTransaction(async (c) => {
      const guest = await c.query('SELECT * FROM carts WHERE session_id = $1', [sessionId]);
      if (!guest.rowCount) return null;

      const userCart = await c.query(
        `INSERT INTO carts (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING *`,
        [req.user.id]
      );
      const target = userCart.rows[0];

      await c.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, saved_for_later)
         SELECT $1, product_id, quantity, saved_for_later
         FROM cart_items WHERE cart_id = $2
         ON CONFLICT (cart_id, product_id)
         DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 30)`,
        [target.id, guest.rows[0].id]
      );

      await c.query('DELETE FROM carts WHERE id = $1', [guest.rows[0].id]);
      return target.id;
    });

    const cart = merged ?? (await resolveCart(req))?.id;
    res.json(await cartPayload(cart));
  } catch (err) {
    next(err);
  }
});
