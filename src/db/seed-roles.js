/**
 * Seeds the seller and admin accounts, then assigns every existing product to a
 * seller so the marketplace has real attribution from the first page load.
 *
 * Products are distributed by brand: a product's brand decides which store sells
 * it, so the assignment looks deliberate rather than random. Order lines are
 * backfilled with the matching seller_id so seller dashboards show real historic
 * sales rather than starting empty.
 *
 * Idempotent - re-running updates the same accounts rather than duplicating them.
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const SELLERS = [
  {
    email: 'seller@example.com',
    name: 'Nova Retail',
    store: 'Nova Retail Group',
    slug: 'nova-retail',
    // Brands this store carries. Anything unmatched falls to the first seller.
    brands: ['Amazon', 'Sony', 'Apple', 'Samsung'],
  },
  {
    email: 'seller2@example.com',
    name: 'Harbor Goods',
    store: 'Harbor Home & Kitchen',
    slug: 'harbor-goods',
    brands: ['Instant Pot', 'Ninja', 'Stanley', 'Lodge', 'Hydro Flask'],
  },
  {
    email: 'seller3@example.com',
    name: 'Meridian Supply',
    store: 'Meridian Supply Co.',
    slug: 'meridian-supply',
    brands: ['Levi\'s', 'Hanes', 'CeraVe', 'LEGO', 'Logitech', 'Avery',
             'Hay House', 'Fit Simplify'],
  },
];

const ADMIN = {
  email: 'admin@example.com',
  name: 'Site Admin',
};

async function main() {
  const password = await bcrypt.hash('Password123!', 10);

  const summary = await withTransaction(async (c) => {
    // --- accounts -------------------------------------------------------
    const sellerIds = [];
    for (const s of SELLERS) {
      const { rows } = await c.query(
        `INSERT INTO users (email, name, password_hash, role, store_name, store_slug, seller_since)
         VALUES ($1,$2,$3,'seller',$4,$5, NOW() - INTERVAL '8 months')
         ON CONFLICT (email) DO UPDATE
           SET role = 'seller',
               name = EXCLUDED.name,
               store_name = EXCLUDED.store_name,
               store_slug = EXCLUDED.store_slug,
               password_hash = EXCLUDED.password_hash,
               seller_since = COALESCE(users.seller_since, EXCLUDED.seller_since)
         RETURNING id`,
        [s.email, s.name, password, s.store, s.slug]
      );
      sellerIds.push({ id: rows[0].id, brands: s.brands, store: s.store });
    }

    const { rows: adminRows } = await c.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1,$2,$3,'admin')
       ON CONFLICT (email) DO UPDATE
         SET role = 'admin', password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [ADMIN.email, ADMIN.name, password]
    );
    const adminId = adminRows[0].id;

    // --- assign products by brand ---------------------------------------
    let assigned = 0;
    for (const s of sellerIds) {
      const { rowCount } = await c.query(
        `UPDATE products SET seller_id = $1
         WHERE brand = ANY($2::text[])`,
        [s.id, s.brands]
      );
      assigned += rowCount;
    }

    // Anything whose brand did not match goes to the first store, so no product
    // is left without a seller.
    const { rowCount: orphans } = await c.query(
      'UPDATE products SET seller_id = $1 WHERE seller_id IS NULL',
      [sellerIds[0].id]
    );
    assigned += orphans;

    // --- backfill historic order lines ----------------------------------
    // Without this, existing orders would show no seller and every dashboard
    // would start at zero despite the orders being real.
    const { rowCount: backfilled } = await c.query(
      `UPDATE order_items oi
       SET seller_id = p.seller_id
       FROM products p
       WHERE p.id = oi.product_id AND oi.seller_id IS DISTINCT FROM p.seller_id`
    );

    // Give past orders a plausible fulfilment state rather than leaving
    // everything unshipped, so the seller order queue looks lived-in.
    await c.query(
      `UPDATE order_items oi
       SET fulfillment_status = 'delivered',
           shipped_at = o.placed_at + INTERVAL '1 day',
           tracking_number = 'TBA' || LPAD((oi.id * 7919 % 1000000000)::text, 10, '0')
       FROM orders o
       WHERE o.id = oi.order_id
         AND oi.fulfillment_status = 'unshipped'
         AND o.placed_at < NOW() - INTERVAL '3 days'`
    );

    return { sellers: sellerIds.length, adminId, assigned, backfilled, orphans };
  });

  console.log(
    `[roles] ${summary.sellers} sellers + 1 admin; ` +
      `${summary.assigned} products assigned (${summary.orphans} by fallback); ` +
      `${summary.backfilled} order lines backfilled`
  );

  const { rows } = await pool.query(
    `SELECT u.store_name,
            COUNT(DISTINCT p.id)::int AS products,
            COUNT(DISTINCT oi.id)::int AS sold_lines
     FROM users u
     LEFT JOIN products p ON p.seller_id = u.id
     LEFT JOIN order_items oi ON oi.seller_id = u.id
     WHERE u.role = 'seller'
     GROUP BY u.id, u.store_name
     ORDER BY u.id`
  );
  for (const r of rows) {
    console.log(`  ${r.store_name}: ${r.products} products, ${r.sold_lines} sold lines`);
  }

  const unassigned = await pool.query(
    'SELECT COUNT(*)::int AS n FROM products WHERE seller_id IS NULL'
  );
  console.log(`[roles] products without a seller: ${unassigned.rows[0].n}`);

  console.log('\n[roles] accounts (all password: Password123!)');
  console.log('  admin@example.com    admin');
  for (const s of SELLERS) console.log(`  ${s.email.padEnd(20)} seller - ${s.store}`);
  console.log('  demo@example.com     customer');

  await pool.end();
}

main().catch((e) => {
  console.error('[roles] failed:', e.message);
  process.exit(1);
});
