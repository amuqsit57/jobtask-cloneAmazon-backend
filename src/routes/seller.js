import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { serializeProduct, formatPrice } from '../lib/serialize.js';

export const sellerRouter = Router();

sellerRouter.use(requireAuth, requireRole('seller'));

/**
 * An admin acting inside the seller area needs a seller to act as. When a seller
 * is signed in it is always themselves; an admin may pass ?sellerId= to inspect
 * a particular store.
 */
function sellerScope(req) {
  if (req.user.role === 'admin' && req.query.sellerId) {
    return Number(req.query.sellerId);
  }
  return req.user.id;
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

// ---- dashboard ------------------------------------------------------------

sellerRouter.get('/stats', async (req, res, next) => {
  try {
    const id = sellerScope(req);

    const [totals, recent, lowStock, byDay, topProducts] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::int AS revenue,
           COALESCE(SUM(oi.quantity), 0)::int AS units,
           COUNT(DISTINCT oi.order_id)::int AS orders
         FROM order_items oi
         WHERE oi.seller_id = $1`,
        [id]
      ),
      query(
        `SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::int AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.seller_id = $1 AND o.placed_at > NOW() - INTERVAL '30 days'`,
        [id]
      ),
      query(
        `SELECT id, slug, title, stock FROM products
         WHERE seller_id = $1 AND stock < 25 AND status = 'active'
         ORDER BY stock ASC LIMIT 10`,
        [id]
      ),
      query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::int AS revenue
         FROM generate_series(
                CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day'
              ) AS d(day)
         LEFT JOIN orders o ON o.placed_at::date = d.day
         LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.seller_id = $1
         GROUP BY d.day ORDER BY d.day`,
        [id]
      ),
      query(
        `SELECT p.id, p.slug, p.title, p.stock,
                COALESCE(SUM(oi.quantity), 0)::int AS units,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)::int AS revenue,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                  ORDER BY sort LIMIT 1) AS image_url
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id AND oi.seller_id = $1
         WHERE p.seller_id = $1
         GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
        [id]
      ),
    ]);

    const counts = await query(
      `SELECT status, COUNT(*)::int AS n FROM products
       WHERE seller_id = $1 GROUP BY status`,
      [id]
    );
    const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));

    const pending = await query(
      `SELECT COUNT(*)::int AS n FROM order_items
       WHERE seller_id = $1 AND fulfillment_status = 'unshipped'`,
      [id]
    );

    res.json({
      revenue: totals.rows[0].revenue,
      revenueFormatted: formatPrice(totals.rows[0].revenue),
      revenue30d: recent.rows[0].revenue,
      revenue30dFormatted: formatPrice(recent.rows[0].revenue),
      unitsSold: totals.rows[0].units,
      orderCount: totals.rows[0].orders,
      pendingShipments: pending.rows[0].n,
      productsByStatus: {
        active: byStatus.active ?? 0,
        pending: byStatus.pending ?? 0,
        rejected: byStatus.rejected ?? 0,
        archived: byStatus.archived ?? 0,
      },
      lowStock: lowStock.rows,
      salesByDay: byDay.rows,
      topProducts: topProducts.rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        stock: r.stock,
        image: r.image_url,
        units: r.units,
        revenue: r.revenue,
        revenueFormatted: formatPrice(r.revenue),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---- products -------------------------------------------------------------

sellerRouter.get('/products', async (req, res, next) => {
  try {
    const id = sellerScope(req);
    const { rows } = await query(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                ORDER BY sort LIMIT 1) AS image_url,
              COALESCE((SELECT SUM(quantity) FROM order_items oi
                        WHERE oi.product_id = p.id), 0)::int AS units_sold
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC`,
      [id]
    );
    res.json({
      products: rows.map((r) =>
        serializeProduct(r, {
          rest: {
            status: r.status,
            rejectionReason: r.rejection_reason,
            unitsSold: r.units_sold,
          },
        })
      ),
    });
  } catch (err) {
    next(err);
  }
});

sellerRouter.post('/products', async (req, res, next) => {
  try {
    const id = sellerScope(req);
    const {
      title, brand, description, bullets, categoryId,
      price, listPrice, stock, images,
    } = req.body ?? {};

    if (!title?.trim() || title.trim().length < 5) {
      return res.status(400).json({ error: 'Give the product a longer title' });
    }
    const cents = Math.round(Number(price) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'Enter a valid price' });
    }

    // Slug must be unique; append a short suffix rather than failing on collision.
    let slug = slugify(title);
    const clash = await query('SELECT 1 FROM products WHERE slug = $1', [slug]);
    if (clash.rowCount) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const created = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO products
           (slug, title, brand, description, bullets, category_id, price_cents,
            list_price_cents, stock, seller_id, status, is_prime)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,'pending',TRUE)
         RETURNING *`,
        [
          slug, title.trim(), brand?.trim() || null, description?.trim() || null,
          JSON.stringify(Array.isArray(bullets) ? bullets.filter(Boolean) : []),
          categoryId || null, cents,
          listPrice ? Math.round(Number(listPrice) * 100) : null,
          Number(stock) || 0, id,
        ]
      );
      const product = rows[0];

      const urls = (Array.isArray(images) ? images : []).filter(Boolean);
      for (const [i, url] of urls.entries()) {
        await c.query(
          'INSERT INTO product_images (product_id, url, alt, sort) VALUES ($1,$2,$3,$4)',
          [product.id, url, title.trim(), i]
        );
      }
      return product;
    });

    res.status(201).json({
      product: serializeProduct(created, { rest: { status: created.status } }),
      message: 'Submitted for review. It goes live once an admin approves it.',
    });
  } catch (err) {
    next(err);
  }
});

sellerRouter.patch('/products/:id', async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const owned = await query(
      'SELECT * FROM products WHERE id = $1 AND seller_id = $2',
      [req.params.id, sellerId]
    );
    if (!owned.rowCount) {
      return res.status(404).json({ error: 'Product not found in your catalog' });
    }

    const { title, description, price, listPrice, stock, bullets, brand } = req.body ?? {};

    const { rows } = await query(
      `UPDATE products SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         brand = COALESCE($3, brand),
         price_cents = COALESCE($4, price_cents),
         list_price_cents = COALESCE($5, list_price_cents),
         stock = COALESCE($6, stock),
         bullets = COALESCE($7::jsonb, bullets)
       WHERE id = $8 AND seller_id = $9
       RETURNING *`,
      [
        title?.trim() || null,
        description?.trim() || null,
        brand?.trim() || null,
        price != null ? Math.round(Number(price) * 100) : null,
        listPrice != null ? Math.round(Number(listPrice) * 100) : null,
        stock != null ? Number(stock) : null,
        bullets ? JSON.stringify(bullets) : null,
        req.params.id, sellerId,
      ]
    );
    res.json({ product: serializeProduct(rows[0], { rest: { status: rows[0].status } }) });
  } catch (err) {
    next(err);
  }
});

/**
 * Archiving rather than deleting: a product referenced by past orders must keep
 * existing, and archived products drop out of the storefront anyway.
 */
sellerRouter.delete('/products/:id', async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const { rowCount } = await query(
      `UPDATE products SET status = 'archived'
       WHERE id = $1 AND seller_id = $2`,
      [req.params.id, sellerId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Product not found in your catalog' });
    res.json({ archived: true });
  } catch (err) {
    next(err);
  }
});

// ---- orders ---------------------------------------------------------------

sellerRouter.get('/orders', async (req, res, next) => {
  try {
    const id = sellerScope(req);
    const { rows } = await query(
      `SELECT oi.*, o.order_number, o.placed_at, o.ship_to, p.slug,
              u.name AS buyer_name
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE oi.seller_id = $1
       ORDER BY o.placed_at DESC
       LIMIT 100`,
      [id]
    );

    res.json({
      orders: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        placedAt: r.placed_at,
        buyerName: r.buyer_name,
        shipTo: r.ship_to,
        productId: r.product_id,
        slug: r.slug,
        title: r.title,
        image: r.image_url,
        quantity: r.quantity,
        unitPrice: Number(r.unit_price_cents),
        unitPriceFormatted: formatPrice(r.unit_price_cents),
        lineTotal: Number(r.unit_price_cents) * Number(r.quantity),
        lineTotalFormatted: formatPrice(Number(r.unit_price_cents) * Number(r.quantity)),
        fulfillmentStatus: r.fulfillment_status,
        shippedAt: r.shipped_at,
        trackingNumber: r.tracking_number,
      })),
    });
  } catch (err) {
    next(err);
  }
});

sellerRouter.post('/orders/:itemId/ship', async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const tracking =
      req.body?.trackingNumber?.trim() ||
      'TBA' + String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);

    const { rows } = await query(
      `UPDATE order_items
       SET fulfillment_status = 'shipped', shipped_at = NOW(), tracking_number = $1
       WHERE id = $2 AND seller_id = $3 AND fulfillment_status = 'unshipped'
       RETURNING *`,
      [tracking, req.params.itemId, sellerId]
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ error: 'That line is not yours, or has already shipped' });
    }
    res.json({
      item: {
        id: rows[0].id,
        fulfillmentStatus: rows[0].fulfillment_status,
        trackingNumber: rows[0].tracking_number,
        shippedAt: rows[0].shipped_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---- inventory ------------------------------------------------------------

sellerRouter.patch('/inventory/:id', async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const stock = Number(req.body?.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Stock must be zero or more' });
    }
    const { rows } = await query(
      `UPDATE products SET stock = $1 WHERE id = $2 AND seller_id = $3
       RETURNING id, stock`,
      [stock, req.params.id, sellerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found in your catalog' });
    res.json({ id: rows[0].id, stock: rows[0].stock });
  } catch (err) {
    next(err);
  }
});
