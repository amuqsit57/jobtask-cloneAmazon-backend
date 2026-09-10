/**
 * Seed the catalog.
 *
 * Idempotent: truncates the catalog tables and rebuilds them, so running it twice
 * leaves the same state rather than duplicating every product. Users and orders are
 * left alone unless --reset is passed, so re-seeding the catalog during development
 * does not sign everyone out.
 *
 *   npm run seed            reseed catalog, keep accounts
 *   npm run seed -- --reset wipe everything including accounts
 */

import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';
import {
  categories,
  products,
  imageUrl,
  reviewTemplates,
  reviewAuthors,
} from './seed-data.js';

const RESET = process.argv.includes('--reset');

/** Deterministic pseudo-random so a given product always seeds the same reviews. */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

async function seed() {
  console.log(`[seed] starting${RESET ? ' (full reset)' : ''}...`);

  await withTransaction(async (c) => {
    if (RESET) {
      await c.query(
        'TRUNCATE order_items, orders, cart_items, carts, addresses, users RESTART IDENTITY CASCADE'
      );
      console.log('[seed] cleared accounts and orders');
    }

    await c.query(
      'TRUNCATE reviews, product_variants, product_images, products, categories RESTART IDENTITY CASCADE'
    );

    // --- categories -----------------------------------------------------
    const catIds = new Map();
    for (const cat of categories) {
      const { rows } = await c.query(
        `INSERT INTO categories (slug, name, sort, image_url)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [cat.slug, cat.name, cat.sort, imageUrl(cat.image, 600)]
      );
      catIds.set(cat.slug, rows[0].id);
    }
    console.log(`[seed] ${categories.length} categories`);

    // --- products -------------------------------------------------------
    let imageCount = 0;
    let variantCount = 0;
    let reviewCount = 0;

    for (const p of products) {
      const { rows } = await c.query(
        `INSERT INTO products
           (slug, title, brand, description, bullets, category_id, price_cents,
            list_price_cents, stock, rating, review_count, is_prime, is_best_seller)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          p.slug,
          p.title,
          p.brand,
          p.description,
          JSON.stringify(p.bullets),
          catIds.get(p.category),
          p.price,
          p.listPrice,
          p.stock,
          p.rating,
          p.reviews,
          p.prime,
          p.bestSeller,
        ]
      );
      const productId = rows[0].id;

      for (const [i, im] of p.images.entries()) {
        await c.query(
          `INSERT INTO product_images (product_id, url, alt, sort)
           VALUES ($1, $2, $3, $4)`,
          [productId, imageUrl(im, 900), p.title, i]
        );
        imageCount++;
      }

      for (const v of p.variants ?? []) {
        await c.query(
          `INSERT INTO product_variants (product_id, name, value, price_delta_cents)
           VALUES ($1, $2, $3, $4)`,
          [productId, v.name, v.value, v.delta]
        );
        variantCount++;
      }

      // A handful of displayed reviews per product. review_count on the product
      // stays at the real (large) headline number; these are the ones rendered.
      const rand = seededRandom(productId * 7919);
      const n = 4 + Math.floor(rand() * 4);
      const used = new Set();
      for (let i = 0; i < n; i++) {
        let idx = Math.floor(rand() * reviewTemplates.length);
        while (used.has(idx)) idx = (idx + 1) % reviewTemplates.length;
        used.add(idx);

        const t = reviewTemplates[idx];
        const author = reviewAuthors[Math.floor(rand() * reviewAuthors.length)];
        const daysAgo = Math.floor(rand() * 400) + 1;

        await c.query(
          `INSERT INTO reviews (product_id, author, rating, title, body, verified, helpful, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - ($8 || ' days')::interval)`,
          [
            productId,
            author,
            t.rating,
            t.title,
            t.body,
            rand() > 0.2,
            Math.floor(rand() * 240),
            String(daysAgo),
          ]
        );
        reviewCount++;
      }
    }

    console.log(
      `[seed] ${products.length} products, ${imageCount} images, ${variantCount} variants, ${reviewCount} reviews`
    );

    // --- demo account ---------------------------------------------------
    // A known login so the deployed site can be explored without signing up.
    const hash = await bcrypt.hash('Password123!', 10);
    const { rows: userRows } = await c.query(
      `INSERT INTO users (email, name, password_hash, is_prime)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['demo@example.com', 'Demo Customer', hash]
    );
    const demoId = userRows[0].id;

    const { rowCount: hasAddress } = await c.query(
      'SELECT 1 FROM addresses WHERE user_id = $1',
      [demoId]
    );
    if (!hasAddress) {
      await c.query(
        `INSERT INTO addresses (user_id, full_name, line1, city, state, postal_code, phone, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
        [demoId, 'Demo Customer', '410 Terry Ave N', 'Seattle', 'WA', '98109', '206-555-0142']
      );
    }
    console.log('[seed] demo account: demo@example.com / Password123!');
  });

  // Sanity check that what we think we wrote is actually queryable.
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM products)   AS products,
       (SELECT COUNT(*) FROM categories) AS categories,
       (SELECT COUNT(*) FROM reviews)    AS reviews,
       (SELECT COUNT(*) FROM product_images) AS images`
  );
  console.log('[seed] verify:', rows[0]);

  // Confirm full-text search actually resolves against the seeded rows.
  const { rows: hit } = await pool.query(
    `SELECT title FROM products
     WHERE search_tsv @@ plainto_tsquery('english', $1) LIMIT 1`,
    ['wireless headphones']
  );
  console.log(
    '[seed] search check ("wireless headphones"):',
    hit[0]?.title?.slice(0, 60) ?? 'NO MATCH'
  );

  await pool.end();
  console.log('[seed] done.');
}

seed().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
