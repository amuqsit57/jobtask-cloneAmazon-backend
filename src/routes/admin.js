import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { serializeProduct, formatPrice } from '../lib/serialize.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

/** Every moderation decision is written to admin_actions so it is auditable. */
async function logAction(c, adminId, action, targetType, targetId, note) {
  await c.query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [adminId, action, targetType, targetId, note ?? null]
  );
}

// ---- overview -------------------------------------------------------------

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [platform, users, products, byDay, topSellers] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total_cents), 0)::int AS gmv,
                COUNT(*)::int AS orders
         FROM orders`
      ),
      query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role`),
      query(`SELECT status, COUNT(*)::int AS n FROM products GROUP BY status`),
      query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(o.total_cents), 0)::int AS revenue
         FROM generate_series(
                CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day'
              ) AS d(day)
         LEFT JOIN orders o ON o.placed_at::date = d.day
         GROUP BY d.day ORDER BY d.day`
      ),
      query(
        `SELECT u.id, u.store_name, u.email,
                COUNT(DISTINCT p.id)::int AS products,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::int AS revenue
         FROM users u
         LEFT JOIN products p ON p.seller_id = u.id
         LEFT JOIN order_items oi ON oi.seller_id = u.id
         WHERE u.role = 'seller'
         GROUP BY u.id
         ORDER BY revenue DESC`
      ),
    ]);

    const roleCounts = Object.fromEntries(users.rows.map((r) => [r.role, r.n]));
    const statusCounts = Object.fromEntries(products.rows.map((r) => [r.status, r.n]));

    res.json({
      gmv: platform.rows[0].gmv,
      gmvFormatted: formatPrice(platform.rows[0].gmv),
      orderCount: platform.rows[0].orders,
      users: {
        customers: roleCounts.customer ?? 0,
        sellers: roleCounts.seller ?? 0,
        admins: roleCounts.admin ?? 0,
      },
      products: {
        active: statusCounts.active ?? 0,
        pending: statusCounts.pending ?? 0,
        rejected: statusCounts.rejected ?? 0,
        archived: statusCounts.archived ?? 0,
      },
      revenueByDay: byDay.rows,
      sellers: topSellers.rows.map((r) => ({
        id: r.id,
        storeName: r.store_name,
        email: r.email,
        products: r.products,
        revenue: r.revenue,
        revenueFormatted: formatPrice(r.revenue),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---- listing moderation ---------------------------------------------------

adminRouter.get('/products', async (req, res, next) => {
  try {
    const status = req.query.status;
    const where = status ? 'WHERE p.status = $1' : '';
    const params = status ? [status] : [];

    const { rows } = await query(
      `SELECT p.*, u.store_name, u.email AS seller_email,
              c.name AS category_name, c.slug AS category_slug,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                ORDER BY sort LIMIT 1) AS image_url
       FROM products p
       LEFT JOIN users u ON u.id = p.seller_id
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY
         CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,
         p.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      products: rows.map((r) =>
        serializeProduct(r, {
          rest: {
            status: r.status,
            rejectionReason: r.rejection_reason,
            sellerId: r.seller_id,
            storeName: r.store_name,
            sellerEmail: r.seller_email,
          },
        })
      ),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/products/:id/moderate', async (req, res, next) => {
  try {
    const { decision, reason } = req.body ?? {};
    if (!['approve', 'reject', 'archive'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve, reject or archive' });
    }
    if (decision === 'reject' && !reason?.trim()) {
      return res.status(400).json({ error: 'Give the seller a reason for the rejection' });
    }

    const status =
      decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : 'archived';

    const updated = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `UPDATE products SET status = $1, rejection_reason = $2 WHERE id = $3 RETURNING *`,
        [status, decision === 'reject' ? reason.trim() : null, req.params.id]
      );
      if (!rows.length) {
        throw Object.assign(new Error('Product not found'), { status: 404 });
      }
      await logAction(c, req.user.id, decision, 'product', Number(req.params.id), reason);
      return rows[0];
    });

    res.json({
      product: serializeProduct(updated, { rest: { status: updated.status } }),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ---- users ----------------------------------------------------------------

adminRouter.get('/users', async (req, res, next) => {
  try {
    const role = req.query.role;
    const where = role ? 'WHERE u.role = $1' : '';
    const params = role ? [role] : [];

    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.role, u.store_name, u.is_prime, u.created_at,
              COUNT(DISTINCT o.id)::int AS order_count,
              COALESCE(SUM(o.total_cents), 0)::int AS lifetime_spend
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        storeName: r.store_name,
        isPrime: r.is_prime,
        createdAt: r.created_at,
        orderCount: r.order_count,
        lifetimeSpend: r.lifetime_spend,
        lifetimeSpendFormatted: formatPrice(r.lifetime_spend),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Change a user's role. Promoting to seller needs a store name, since every
 * seller-facing surface displays one.
 */
adminRouter.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role, storeName } = req.body ?? {};
    if (!['customer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be customer, seller or admin' });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const updated = await withTransaction(async (c) => {
      const target = await c.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
      if (!target.rowCount) {
        throw Object.assign(new Error('User not found'), { status: 404 });
      }

      const name = storeName?.trim() || target.rows[0].store_name ||
        `${target.rows[0].name}'s Store`;
      const slug = role === 'seller'
        ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
          '-' + req.params.id
        : null;

      const { rows } = await c.query(
        `UPDATE users SET
           role = $1,
           store_name = CASE WHEN $1 = 'seller' THEN $2 ELSE store_name END,
           store_slug = CASE WHEN $1 = 'seller' THEN $3 ELSE store_slug END,
           seller_since = CASE WHEN $1 = 'seller' THEN COALESCE(seller_since, NOW()) ELSE seller_since END
         WHERE id = $4 RETURNING *`,
        [role, name, slug, req.params.id]
      );
      await logAction(c, req.user.id, `role:${role}`, 'user', Number(req.params.id), null);
      return rows[0];
    });

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        storeName: updated.store_name,
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ---- orders and audit -----------------------------------------------------

adminRouter.get('/orders', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*, u.email AS buyer_email, u.name AS buyer_name,
              COUNT(oi.id)::int AS line_count
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id, u.email, u.name
       ORDER BY o.placed_at DESC LIMIT 100`
    );

    res.json({
      orders: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        buyerEmail: r.buyer_email,
        buyerName: r.buyer_name,
        placedAt: r.placed_at,
        status: r.status,
        lineCount: r.line_count,
        total: Number(r.total_cents),
        totalFormatted: formatPrice(r.total_cents),
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/actions', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, u.name AS admin_name FROM admin_actions a
       LEFT JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC LIMIT 50`
    );
    res.json({
      actions: rows.map((r) => ({
        id: r.id,
        adminName: r.admin_name,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        note: r.note,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---- categories -----------------------------------------------------------

adminRouter.post('/categories', async (req, res, next) => {
  try {
    const { name, image } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'Category name is required' });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { rows } = await query(
      `INSERT INTO categories (slug, name, image_url, sort)
       VALUES ($1,$2,$3, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories))
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [slug, name.trim(), image ?? null]
    );
    res.status(201).json({ category: rows[0] });
  } catch (err) {
    next(err);
  }
});
