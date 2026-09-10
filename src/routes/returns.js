import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../lib/auth.js';
import { formatPrice } from '../lib/serialize.js';

export const returnsRouter = Router();

export const RETURN_REASONS = [
  'No longer needed',
  'Item arrived too late',
  'Item defective or does not work',
  'Wrong item was sent',
  'Item damaged during shipping',
  'Better price available',
  'Item does not match description',
  'Missing parts or accessories',
];

returnsRouter.get('/reasons', (_req, res) => {
  res.json({ reasons: RETURN_REASONS });
});

returnsRouter.use(requireAuth);

returnsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, oi.title, oi.image_url, oi.quantity, o.order_number
       FROM returns r
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json({
      returns: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        title: r.title,
        image: r.image_url,
        reason: r.reason,
        comments: r.comments,
        status: r.status,
        refund: Number(r.refund_cents),
        refundFormatted: formatPrice(r.refund_cents),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Request a return for one order line.
 *
 * Restocks the returned units and marks the order line as returned in the same
 * transaction, so inventory and order state can never disagree. The uniqueness
 * constraint on order_item_id is what stops the same line being returned twice.
 */
returnsRouter.post('/', async (req, res, next) => {
  try {
    const { orderItemId, reason, comments } = req.body ?? {};
    if (!orderItemId || !reason) {
      return res.status(400).json({ error: 'orderItemId and reason are required' });
    }
    if (!RETURN_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Choose a valid return reason' });
    }

    const result = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT oi.*, o.id AS order_id, o.user_id, o.placed_at
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1`,
        [orderItemId]
      );
      const item = rows[0];

      if (!item || item.user_id !== req.user.id) {
        throw Object.assign(new Error('Order item not found'), { status: 404 });
      }

      const existing = await c.query(
        'SELECT 1 FROM returns WHERE order_item_id = $1',
        [orderItemId]
      );
      if (existing.rowCount) {
        throw Object.assign(
          new Error('A return has already been requested for this item'),
          { status: 409 }
        );
      }

      // Amazon's window is 30 days from delivery; approximating from order date.
      const days = (Date.now() - new Date(item.placed_at).getTime()) / 86_400_000;
      if (days > 30) {
        throw Object.assign(
          new Error('This item is outside the 30-day return window'),
          { status: 400 }
        );
      }

      const refund = Number(item.unit_price_cents) * Number(item.quantity);

      const { rows: created } = await c.query(
        `INSERT INTO returns
           (order_id, order_item_id, user_id, reason, comments, refund_cents, status)
         VALUES ($1,$2,$3,$4,$5,$6,'approved') RETURNING *`,
        [item.order_id, orderItemId, req.user.id, reason, comments?.trim() || null, refund]
      );

      if (item.product_id) {
        await c.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
          item.quantity,
          item.product_id,
        ]);
      }

      return { ...created[0], title: item.title };
    });

    res.status(201).json({
      return: {
        id: result.id,
        title: result.title,
        reason: result.reason,
        status: result.status,
        refund: Number(result.refund_cents),
        refundFormatted: formatPrice(result.refund_cents),
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});
