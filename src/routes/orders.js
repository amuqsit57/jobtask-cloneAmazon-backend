import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { serializeOrder } from '../lib/serialize.js';
import { requireAuth } from '../lib/auth.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const TAX_RATE = 0.0725;          // flat rate; real tax is jurisdictional
const FREE_SHIPPING_THRESHOLD = 3500;
const SHIPPING_FLAT = 599;

ordersRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY placed_at DESC',
      [req.user.id]
    );

    const orders = await Promise.all(
      rows.map(async (o) => {
        const items = await query(
          `SELECT oi.*, p.slug FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = $1`,
          [o.id]
        );
        return serializeOrder(o, items.rows);
      })
    );

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/:orderNumber', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM orders WHERE order_number = $1 AND user_id = $2',
      [req.params.orderNumber, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });

    const items = await query(
      `SELECT oi.*, p.slug FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [rows[0].id]
    );
    res.json({ order: serializeOrder(rows[0], items.rows) });
  } catch (err) {
    next(err);
  }
});

/**
 * Place an order from the current cart.
 *
 * Runs in one transaction: prices are re-read from the products table rather than
 * trusted from the client, stock is decremented, line items snapshot what was
 * bought, and the cart is emptied. If any step fails the whole thing rolls back,
 * so there is never an order with no stock movement or a half-emptied cart.
 */
ordersRouter.post('/', async (req, res, next) => {
  try {
    const { shipTo, paymentLast4 } = req.body ?? {};
    if (!shipTo?.line1 || !shipTo?.city || !shipTo?.postal_code) {
      return res.status(400).json({ error: 'A complete shipping address is required' });
    }

    const order = await withTransaction(async (c) => {
      const cart = await c.query('SELECT * FROM carts WHERE user_id = $1', [req.user.id]);
      if (!cart.rowCount) throw Object.assign(new Error('Your cart is empty'), { status: 400 });

      const items = await c.query(
        `SELECT ci.quantity, p.id, p.title, p.price_cents, p.stock,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                  ORDER BY sort LIMIT 1) AS image_url
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = $1 AND ci.saved_for_later = FALSE`,
        [cart.rows[0].id]
      );
      if (!items.rowCount) {
        throw Object.assign(new Error('Your cart is empty'), { status: 400 });
      }

      for (const it of items.rows) {
        if (it.stock < it.quantity) {
          throw Object.assign(
            new Error(`Not enough stock for ${it.title}`),
            { status: 409 }
          );
        }
      }

      const subtotal = items.rows.reduce(
        (s, i) => s + Number(i.price_cents) * Number(i.quantity),
        0
      );
      const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
      const tax = Math.round(subtotal * TAX_RATE);
      const total = subtotal + shipping + tax;

      const orderNumber =
        '112-' +
        String(Math.floor(Math.random() * 9_000_000) + 1_000_000) +
        '-' +
        String(Math.floor(Math.random() * 9_000_000) + 1_000_000);

      const delivery = new Date();
      delivery.setDate(delivery.getDate() + (shipping === 0 ? 2 : 5));

      const { rows: orderRows } = await c.query(
        `INSERT INTO orders
           (user_id, order_number, subtotal_cents, shipping_cents, tax_cents,
            total_cents, ship_to, payment_last4, delivery_estimate)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
         RETURNING *`,
        [
          req.user.id, orderNumber, subtotal, shipping, tax, total,
          JSON.stringify(shipTo), paymentLast4 ?? '4242',
          delivery.toISOString().slice(0, 10),
        ]
      );
      const created = orderRows[0];

      for (const it of items.rows) {
        await c.query(
          `INSERT INTO order_items
             (order_id, product_id, title, image_url, unit_price_cents, quantity)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [created.id, it.id, it.title, it.image_url, it.price_cents, it.quantity]
        );
        await c.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [
          it.quantity, it.id,
        ]);
      }

      await c.query(
        'DELETE FROM cart_items WHERE cart_id = $1 AND saved_for_later = FALSE',
        [cart.rows[0].id]
      );

      const finalItems = await c.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [created.id]
      );
      return serializeOrder(created, finalItems.rows);
    });

    res.status(201).json({ order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});
